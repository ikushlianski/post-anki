import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("The sign-in gate shows only when the app has no credential")
    struct SignInGateSmokeTests {
        @Test("should require sign-in when no token is stored or the token is blank")
        func requiresSignInWithoutToken() {
            #expect(SignInGate.needsSignIn(token: nil))
            #expect(SignInGate.needsSignIn(token: ""))
            #expect(SignInGate.needsSignIn(token: "  \n"))
        }

        @Test("should go straight to the tabs when a token is available")
        func skipsGateWithToken() {
            #expect(!SignInGate.needsSignIn(token: "abc123"))
        }

        @Test("should tell the user wrong password and connection failure apart")
        func messagesDiffer() {
            #expect(SignInGate.message(for: PasswordSignInError.wrongCredentials) == "Wrong email or password.")
            #expect(SignInGate.message(for: URLError(.notConnectedToInternet)) == "Couldn't connect to the server. Try again.")
        }

        @Test("should not allow submitting until email and password are filled")
        func submitNeedsBothFields() {
            let model = SignInGateModel()

            #expect(!model.canSubmit)
            model.email = "a@b.c"
            #expect(!model.canSubmit)
            model.password = "x"
            #expect(model.canSubmit)
        }
    }
}
