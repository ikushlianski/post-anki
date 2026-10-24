import Foundation
import Testing
@testable import PostAnkiAPI

@Suite(.serialized)
struct NetworkContracts {}

struct RecordedRequest {
    let method: String
    let path: String
    let body: [String: Any]?
}

final class RecordingStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) private static var reply: (status: Int, body: Data) = (200, Data("{}".utf8))
    nonisolated(unsafe) private static var recorded: RecordedRequest?
    private static let lock = NSLock()

    static var last: RecordedRequest? { lock.withLock { recorded } }

    static func install(status: Int = 200, body: Data = Data("{}".utf8)) {
        lock.withLock {
            reply = (status, body)
            recorded = nil
        }
        APIClient.useProtocolClasses([RecordingStub.self])
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let data = Self.readBody(request)
        let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let path = request.url?.path(percentEncoded: true) ?? ""
        let current = Self.lock.withLock { () -> (status: Int, body: Data) in
            Self.recorded = RecordedRequest(method: request.httpMethod ?? "", path: path, body: object)
            return Self.reply
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: current.status, httpVersion: nil, headerFields: nil)!

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: current.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func readBody(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }

        guard let stream = request.httpBodyStream else { return nil }

        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)

        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)

            if count <= 0 { break }

            data.append(buffer, count: count)
        }

        return data
    }
}
