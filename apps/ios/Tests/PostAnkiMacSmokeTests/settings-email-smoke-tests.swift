import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Settings sign-in email default")
    struct SettingsEmailSmokeTests {
        @Test("should start with an empty email when none was stored")
        func emptyDefault() throws {
            let suite = "settings-email-\(UUID().uuidString)"
            let defaults = try #require(UserDefaults(suiteName: suite))
            defer { defaults.removePersistentDomain(forName: suite) }

            #expect(SettingsScreenModel(emailStore: SignInEmailStore(defaults: defaults)).email == "")
        }

        @Test("should start with the last signed-in email when one is stored")
        func storedEmail() throws {
            let suite = "settings-email-\(UUID().uuidString)"
            let defaults = try #require(UserDefaults(suiteName: suite))
            defer { defaults.removePersistentDomain(forName: suite) }

            SignInEmailStore(defaults: defaults).save("me@example.test")

            #expect(SettingsScreenModel(emailStore: SignInEmailStore(defaults: defaults)).email == "me@example.test")
        }
    }
}
