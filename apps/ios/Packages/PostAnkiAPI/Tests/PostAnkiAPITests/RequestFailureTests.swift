import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Request failure log", .serialized)
struct RequestFailureTests {
    private func record(_ url: String, status: Int? = 500, error: Error = APIError.badStatus(500, nil)) {
        FailureLog.shared.record(method: "GET", url: URL(string: url), status: status, error: error)
    }

    @Test("should keep the path and status of a failed request but never the query values")
    func dropsQueryValues() {
        FailureLog.shared.reset()
        record("https://example.com/search?q=secret-term&token=abc123")

        let failure = FailureLog.shared.recent.last

        #expect(failure?.path == "/search?q=&token=")
        #expect(failure?.status == 500)
        #expect(failure?.line.contains("secret-term") == false)
        #expect(failure?.line.contains("abc123") == false)
    }

    @Test("should not put the access token anywhere in a recorded failure")
    func neverRecordsToken() throws {
        FailureLog.shared.reset()

        let request = try APIClient.makeRequest("/subjects")
        FailureLog.shared.record(method: "GET", url: request.url, status: 401, error: APIError.unauthorized)

        let dump = FailureLog.shared.recent.map(\.line).joined()

        #expect(dump.contains("Bearer") == false)
        #expect(dump.contains("unauthorized"))
    }

    @Test("should keep only the most recent 50 failures")
    func bufferIsBounded() {
        FailureLog.shared.reset()

        for index in 0..<80 {
            record("https://example.com/item-\(index)")
        }

        let recent = FailureLog.shared.recent

        #expect(recent.count == FailureLog.capacity)
        #expect(recent.first?.path == "/item-30")
        #expect(recent.last?.path == "/item-79")
    }

    @Test("should label a dropped connection as a network failure without a status")
    func networkKind() {
        FailureLog.shared.reset()
        record("https://example.com/a", status: nil, error: URLError(.notConnectedToInternet))

        #expect(FailureLog.shared.recent.last?.kind.hasPrefix("network:") == true)
        #expect(FailureLog.shared.recent.last?.status == nil)
    }
}
