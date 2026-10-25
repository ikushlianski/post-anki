import Foundation
import PostAnkiAPI

enum FakeReply: Sendable {
    case fixture(String)
    case status(Int)
    case failure(URLError.Code)
    case json(Int, String)
    case held(Int, String)
}

struct RecordedRequest: Sendable {
    let method: String
    let path: String
    let body: Data?

    var bodyObject: NSDictionary? {
        body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? NSDictionary }
    }
}

final class FakeServer: URLProtocol, @unchecked Sendable {
    static let host = "fake.postanki.test"

    private static let lock = NSLock()
    nonisolated(unsafe) private static var routes: [String: FakeReply] = [:]
    nonisolated(unsafe) private static var requestedPaths: [String] = []
    nonisolated(unsafe) private static var recorded: [RecordedRequest] = []
    nonisolated(unsafe) private static var heldRequests: [FakeServer] = []

    static func start(_ routes: [String: FakeReply]) {
        lock.withLock {
            self.routes = routes
            requestedPaths = []
            recorded = []
            heldRequests = []
        }

        URLProtocol.registerClass(FakeServer.self)
        APIClient.useProtocolClasses([FakeServer.self])
        UserDefaults.standard.set("https://\(host)", forKey: "apiBaseURL")
    }

    static func stop(restoring savedBaseURL: Any?) {
        URLProtocol.unregisterClass(FakeServer.self)
        APIClient.useProtocolClasses([])

        if let savedBaseURL {
            UserDefaults.standard.set(savedBaseURL, forKey: "apiBaseURL")
        } else {
            UserDefaults.standard.removeObject(forKey: "apiBaseURL")
        }
    }

    static var requested: [String] { lock.withLock { requestedPaths } }

    static var requests: [RecordedRequest] { lock.withLock { recorded } }

    static var writes: [RecordedRequest] { requests.filter { $0.method != "GET" } }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == host
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }

        let method = request.httpMethod ?? "GET"
        let body = requestBody()

        let reply = Self.lock.withLock { () -> FakeReply in
            Self.requestedPaths.append(url.path)
            Self.recorded.append(RecordedRequest(method: method, path: url.path, body: body))

            return Self.routes["\(method) \(url.path)"] ?? Self.routes[url.path] ?? .status(404)
        }

        switch reply {
        case .failure(let code):
            client?.urlProtocol(self, didFailWithError: URLError(code))
        case .status(let status):
            respond(url: url, status: status, body: Data("{}".utf8))
        case .json(let status, let text):
            respond(url: url, status: status, body: Data(text.utf8))
        case .held(let status, let text):
            heldStatus = status
            heldBody = Data(text.utf8)
            Self.lock.withLock { Self.heldRequests.append(self) }
        case .fixture(let name):
            respond(url: url, status: 200, body: (try? SmokeFixture.data(name)) ?? Data("{}".utf8))
        }
    }

    override func stopLoading() {
        Self.lock.withLock { Self.heldRequests.removeAll { $0 === self } }
    }

    private var heldStatus = 200
    private var heldBody = Data()

    static var heldCount: Int { lock.withLock { heldRequests.count } }

    static func releaseHeld() {
        let held = lock.withLock { () -> [FakeServer] in
            defer { heldRequests = [] }

            return heldRequests
        }

        for request in held {
            guard let url = request.request.url else { continue }

            request.respond(url: url, status: request.heldStatus, body: request.heldBody)
        }
    }

    private func requestBody() -> Data? {
        if let body = request.httpBody { return body }

        guard let stream = request.httpBodyStream else { return nil }

        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)

        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)

            if count <= 0 { break }

            data.append(buffer, count: count)
        }

        return data
    }

    private func respond(url: URL, status: Int, body: Data) {
        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )

        if let response {
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        }

        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}

enum SmokeFixture {
    private final class BundleToken {}

    static func data(_ name: String) throws -> Data {
        let bundle = Bundle(for: BundleToken.self)
        let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json")

        guard let url else { throw CocoaError(.fileNoSuchFile) }

        return try Data(contentsOf: url)
    }
}

struct FakeServerSession {
    private let saved: Any?

    init(_ routes: [String: FakeReply]) {
        saved = UserDefaults.standard.object(forKey: "apiBaseURL")
        FakeServer.start(routes)
    }

    func end() {
        FakeServer.stop(restoring: saved)
    }
}
