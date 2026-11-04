import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Signing in with a password yields a long-lived device token")
struct PasswordSignInTests {
    @Test("should return the token from a created response")
    func readsToken() throws {
        let body = Data(#"{"token":"pat_abc","label":"Mac"}"#.utf8)

        #expect(try PasswordSignIn.deviceToken(status: 201, body: body) == "pat_abc")
    }

    @Test("should map wrong credentials and rate limiting to distinct errors")
    func mapsFailures() {
        #expect(throws: PasswordSignInError.wrongCredentials) { try PasswordSignIn.deviceToken(status: 401, body: Data()) }
        #expect(throws: PasswordSignInError.rateLimited) { try PasswordSignIn.deviceToken(status: 429, body: Data()) }
        #expect(throws: PasswordSignInError.server(500)) { try PasswordSignIn.deviceToken(status: 500, body: Data()) }
    }

    @Test("should refuse a success response that carries no token")
    func refusesMissingToken() {
        #expect(throws: PasswordSignInError.noTokenReturned) { try PasswordSignIn.deviceToken(status: 201, body: Data("{}".utf8)) }
        #expect(throws: PasswordSignInError.noTokenReturned) { try PasswordSignIn.deviceToken(status: 201, body: Data(#"{"token":""}"#.utf8)) }
    }
}
