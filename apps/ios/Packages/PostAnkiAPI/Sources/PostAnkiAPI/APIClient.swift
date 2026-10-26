import Foundation

public enum APIError: Error, Sendable {
    case badStatus(Int, String?)
    case badURL
    case unauthorized
}

// Requests carry a bearer access token from the Keychain (TokenStore) when one
// is stored. Base URL is configurable in case a local dev server is preferred.
public enum APIClient {
    public static let productionBaseURLString = "https://post-anki-api-pl6jw2mdla-ew.a.run.app"

    private static let savedKey = "apiBaseURL"
    private static let fallback = FallbackBaseURL()
    private static let sessionBox = SessionBox()

    static var session: URLSession { sessionBox.session }

    public static var recentFailures: [RequestFailure] { FailureLog.shared.recent }

    public static func clearRecentFailures() {
        FailureLog.shared.reset()
    }

    public static func useProtocolClasses(_ classes: [AnyClass]) {
        sessionBox.replace(protocolClasses: classes)
    }

    public static var baseURLString: String {
        get {
            resolveBaseURL(
                launchArgument: launchArgumentValue,
                saved: savedValue,
                fallback: fallback.value
            )
        }
        set {
            UserDefaults.standard.set(newValue, forKey: savedKey)
        }
    }

    public static var hasSavedBaseURL: Bool {
        savedValue != nil
    }

    private static var launchArgumentValue: String? {
        UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)[savedKey] as? String
    }

    private static var savedValue: String? {
        UserDefaults.standard.string(forKey: savedKey)
    }

    public static var defaultBaseURLString: String {
        resolveBaseURL(saved: nil, fallback: fallback.value)
    }

    public static func setFallbackBaseURL(_ value: String?) {
        fallback.value = value
    }

    public static func clearSavedBaseURL() {
        UserDefaults.standard.removeObject(forKey: savedKey)
    }

    static func resolveBaseURL(launchArgument: String? = nil, saved: String?, fallback: String?) -> String {
        for candidate in [launchArgument, saved, fallback] {
            if let value = candidate?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
                return value
            }
        }

        return productionBaseURLString
    }

    public static func allowsPlainHTTP(host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }

        if host == "localhost" || host == "127.0.0.1" { return true }

        #if DEBUG
        return host.hasSuffix(".local") || isPrivateIPv4(host)
        #else
        return false
        #endif
    }

    private static func isPrivateIPv4(_ host: String) -> Bool {
        let parts = host.split(separator: ".").compactMap { Int($0) }

        guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }) else { return false }

        return parts[0] == 10
            || (parts[0] == 172 && (16...31).contains(parts[1]))
            || (parts[0] == 192 && parts[1] == 168)
    }

    private static func canSendToken(to url: URL) -> Bool {
        url.scheme?.lowercased() == "https" || allowsPlainHTTP(host: url.host())
    }

    static func makeRequest(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        timeout: TimeInterval? = nil,
        baseURL: String? = nil
    ) throws -> URLRequest {
        guard let url = URL(string: "\(baseURL ?? baseURLString)\(path)") else {
            throw APIError.badURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "content-type")

        if let timeout {
            req.timeoutInterval = timeout
        }

        if let token = TokenStore.read(), canSendToken(to: url) {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        return req
    }

    static func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        timeout: TimeInterval? = nil,
        baseURL: String? = nil
    ) async throws -> T {
        let req = try makeRequest(path, method: method, body: body, timeout: timeout, baseURL: baseURL)

        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: req)
        } catch {
            if !(error is CancellationError), (error as? URLError)?.code != .cancelled {
                FailureLog.shared.record(method: method, url: req.url, status: nil, error: error)
            }

            throw error
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if status == 401 {
            FailureLog.shared.record(method: method, url: req.url, status: status, error: APIError.unauthorized)
            throw APIError.unauthorized
        }

        guard (200..<300).contains(status) else {
            let code = try? JSONDecoder().decode(APIErrorBody.self, from: data).error
            let failure = APIError.badStatus(status, code)
            FailureLog.shared.record(method: method, url: req.url, status: status, error: failure)
            throw failure
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            FailureLog.shared.record(method: method, url: req.url, status: status, error: error)
            throw error
        }
    }

    public static func listSubjects() async throws -> [Subject] {
        try await request("/subjects")
    }

    public static func listCurricula() async throws -> [Curriculum] {
        try await request("/curricula")
    }

    public static func getCurriculumDetail(_ id: String) async throws -> CurriculumDetail {
        try await request("/curricula/\(encodedSegment(id))")
    }

    static func nextQuestionVariantsPath(topicId: String?, limit: Int) -> String {
        var items = [URLQueryItem(name: "limit", value: String(limit))]

        if let topicId {
            items.append(URLQueryItem(name: "topicId", value: topicId))
        }

        return encodedPath("/knowledge-bits/question-variants/next", query: items)
    }

    public static func nextQuestionVariants(topicId: String? = nil, limit: Int = 5) async throws -> [NextQuestionVariant] {
        try await request(nextQuestionVariantsPath(topicId: topicId, limit: limit))
    }

    public static func gradeAnswer(
        variantId: String,
        userAnswer: String
    ) async throws -> GradeQuestionVariantAnswerResult {
        try await request(
            "/knowledge-bits/question-variants/\(encodedSegment(variantId))/answers",
            method: "POST",
            body: GradeQuestionVariantAnswerInput(userAnswer: userAnswer)
        )
    }

    public static func createKnowledgeSource(text: String, subjectId: String? = nil) async throws -> CreateKnowledgeSourceResult {
        try await request(
            "/knowledge-sources",
            method: "POST",
            body: CreateKnowledgeSourceInput(text: text, subjectId: subjectId)
        )
    }

    public static func detectKnowledgeBits() async throws {
        let _: EmptyResponse = try await request("/knowledge-sources/detect-bits", method: "POST")
    }

    // Server route exists; callers still handle a 404 gracefully rather than crash.
    public static func chatWithKnowledgeBit(
        id: String,
        message: String,
        transcript: [ChatTranscriptEntry]
    ) async throws -> ChatWithKnowledgeBitResult {
        try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat",
            method: "POST",
            body: ChatWithKnowledgeBitInput(
                message: message,
                transcript: transcript.isEmpty ? nil : transcript
            )
        )
    }
}

// URLRequest.httpBody needs a concrete Encodable value at the call site;
// this box lets `request` accept any Encodable body without every caller
// re-declaring its own wrapper.
private struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        encodeClosure = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}

private final class FallbackBaseURL: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: String?

    var value: String? {
        get { lock.withLock { stored } }
        set { lock.withLock { stored = newValue } }
    }
}
