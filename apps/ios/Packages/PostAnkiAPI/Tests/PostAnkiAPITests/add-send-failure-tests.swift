import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Add send failure messages")
struct AddSendFailureTests {
    @Test("should say the text is kept when the phone is offline")
    func offline() {
        #expect(AddSendFailure.message(for: URLError(.notConnectedToInternet)) == AddSendFailure.offline)
        #expect(AddSendFailure.message(for: URLError(.timedOut)).contains("Your text is still here"))
    }

    @Test("should point to Settings when the access token is rejected")
    func unauthorized() {
        #expect(AddSendFailure.message(for: APIError.unauthorized) == AddSendFailure.unauthorized)
        #expect(AddSendFailure.unauthorized.contains("Settings"))
    }

    @Test("should fall back to a generic message for other failures")
    func other() {
        #expect(AddSendFailure.message(for: APIError.badStatus(500, nil)) == AddSendFailure.other)
    }
}
