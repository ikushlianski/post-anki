import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Sign-in email store")
struct SignInEmailStoreTests {
    private func defaults() -> UserDefaults {
        let suite = "email-store-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!

        defaults.removePersistentDomain(forName: suite)

        return defaults
    }

    @Test("should start empty when nobody has signed in on this phone")
    func emptyDefault() {
        #expect(SignInEmailStore(defaults: defaults()).load() == "")
    }

    @Test("should offer the last signed-in email, trimmed, and forget a blank one")
    func remembers() {
        let store = SignInEmailStore(defaults: defaults())

        store.save("  me@example.test ")

        #expect(store.load() == "me@example.test")

        store.save("  ")

        #expect(store.load() == "")
    }
}
