import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Domain recommendation errors tell the user a slow request may still have gone through")
struct DomainMapErrorTests {
    @Test("should say a timed out accept may have finished so the user checks before retrying")
    func timeout() {
        let message = DomainMapError.message(for: URLError(.timedOut))

        #expect(message.contains("took too long"))
    }

    @Test("should keep the generic connection message for other network failures")
    func offline() {
        #expect(DomainMapError.message(for: URLError(.notConnectedToInternet)) == "Couldn't connect to the server. Try again.")
    }

    @Test("should keep the AI failure message for a 502")
    func aiFailure() {
        #expect(DomainMapError.message(for: APIError.badStatus(502, nil)) == "The AI call failed. Try again later.")
    }
}
