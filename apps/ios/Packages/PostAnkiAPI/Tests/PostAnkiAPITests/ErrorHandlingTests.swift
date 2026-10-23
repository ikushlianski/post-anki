import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Error handling")
struct ErrorHandlingTests {
    @Test("should read the error code from a server error body")
    func decodesErrorBody() throws {
        let body = try Fixture.decode(APIErrorBody.self, "error-no-variant")

        #expect(body.error == "no_variant")
    }

    @Test("should decode an error body without a code as no code")
    func decodesErrorBodyWithoutCode() throws {
        #expect(try Fixture.decode(APIErrorBody.self, "error-without-code").error == nil)
    }

    @Test("should accept any success body when the call only needs to succeed")
    func decodesEmptyResponse() throws {
        _ = try Fixture.decode(EmptyResponse.self, "pending-review-count")
    }

    @Test("should treat a dropped connection as offline, not signed out")
    func mapsOffline() {
        for code in [URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost] {
            #expect(ProgressLoadError.from(URLError(code)) == .offline)
        }
    }

    @Test("should map a rejected token to the signed-out state")
    func mapsUnauthorized() {
        #expect(ProgressLoadError.from(APIError.unauthorized) == .unauthorized)
    }

    @Test("should map a 404 to not found and other statuses to a generic failure")
    func mapsStatuses() {
        #expect(ProgressLoadError.from(APIError.badStatus(404, nil)) == .notFound)
        #expect(ProgressLoadError.from(APIError.badStatus(500, "boom")) == .other)
        #expect(ProgressLoadError.from(URLError(.badServerResponse)) == .other)
    }

    @Test("should show no error when the load was cancelled")
    func ignoresCancellation() {
        #expect(ProgressLoadError.from(CancellationError()) == nil)
        #expect(ProgressLoadError.from(URLError(.cancelled)) == nil)
    }

    @Test("should give each load failure a distinct user message")
    func distinctMessages() {
        let cases: [ProgressLoadError] = [.offline, .unauthorized, .notFound, .other]

        #expect(Set(cases.map(\.message)).count == cases.count)
    }
}
