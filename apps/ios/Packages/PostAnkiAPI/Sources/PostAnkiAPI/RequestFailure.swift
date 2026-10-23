import Foundation
import os

public struct RequestFailure: Sendable, Equatable {
    public let date: Date
    public let method: String
    public let path: String
    public let status: Int?
    public let kind: String

    public var line: String {
        let stamp = date.formatted(.iso8601)
        let code = status.map(String.init) ?? "-"

        return "\(stamp) \(method) \(path) status=\(code) kind=\(kind)"
    }
}

final class FailureLog: @unchecked Sendable {
    static let shared = FailureLog()
    static let capacity = 50

    private let lock = NSLock()
    private var entries: [RequestFailure] = []
    private let logger = Logger(subsystem: "com.ikushlianski.postanki", category: "api")

    var recent: [RequestFailure] { lock.withLock { entries } }

    func reset() {
        lock.withLock { entries.removeAll() }
    }

    func record(method: String, url: URL?, status: Int?, error: Error) {
        let failure = RequestFailure(
            date: Date(),
            method: method,
            path: Self.redactedPath(url),
            status: status,
            kind: Self.kind(of: error)
        )

        lock.withLock {
            entries.append(failure)

            if entries.count > Self.capacity {
                entries.removeFirst(entries.count - Self.capacity)
            }
        }

        logger.error("\(failure.method, privacy: .public) \(failure.path, privacy: .public) status=\(failure.status ?? 0, privacy: .public) kind=\(failure.kind, privacy: .public)")
    }

    static func redactedPath(_ url: URL?) -> String {
        guard let url, let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return "(invalid url)"
        }

        let names = (parts.queryItems ?? []).map(\.name)

        guard !names.isEmpty else { return parts.percentEncodedPath }

        return parts.percentEncodedPath + "?" + names.map { "\($0)=" }.joined(separator: "&")
    }

    static func kind(of error: Error) -> String {
        if let urlError = error as? URLError { return "network:\(urlError.code.rawValue)" }

        if case APIError.unauthorized = error { return "unauthorized" }

        if case APIError.badStatus = error { return "bad-status" }

        if case APIError.badURL = error { return "bad-url" }

        if error is DecodingError { return "decode" }

        return "other"
    }
}
