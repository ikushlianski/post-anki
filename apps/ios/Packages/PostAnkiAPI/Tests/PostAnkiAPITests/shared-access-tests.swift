import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Sharing the login and address with the Share extension")
struct SharedAccessTests {
    @Test("should keep a login saved before re-signing working and queue a copy for the shared storage")
    func legacyTokenStillWorks() {
        let outcome = TokenResolution.resolve(shared: nil, legacy: "pat_old", sharedAvailable: true)

        #expect(outcome == .init(token: "pat_old", copyToShared: true))
    }

    @Test("should not try to copy a login when the build has no shared storage")
    func noSharedStorage() {
        let outcome = TokenResolution.resolve(shared: nil, legacy: "pat_old", sharedAvailable: false)

        #expect(outcome == .init(token: "pat_old", copyToShared: false))
    }

    @Test("should prefer the shared login so the extension and app agree after a new sign-in")
    func sharedWins() {
        let outcome = TokenResolution.resolve(shared: "pat_new", legacy: "pat_old", sharedAvailable: true)

        #expect(outcome == .init(token: "pat_new", copyToShared: false))
    }

    @Test("should report no login when neither storage has one")
    func signedOut() {
        #expect(TokenResolution.resolve(shared: nil, legacy: nil, sharedAvailable: true).token == nil)
    }

    @Test("should treat unset or unexpanded group settings as sharing switched off")
    func groupsOffByDefault() {
        let off = SharedAccess(info: ["PostAnkiKeychainGroup": "", "PostAnkiAppGroup": "$(POSTANKI_APP_GROUP)"])

        #expect(off.keychainGroup == nil)
        #expect(off.appGroup == nil)
        #expect(!off.isExtension)
    }

    @Test("should read the configured groups and recognise the extension process")
    func groupsConfigured() {
        let info: [String: Any] = [
            "PostAnkiKeychainGroup": "TEAM.com.example.shared",
            "PostAnkiAppGroup": "TEAM.com.example",
            "NSExtension": ["NSExtensionPointIdentifier": "com.apple.share-services"]
        ]
        let access = SharedAccess(info: info)

        #expect(access.keychainGroup == "TEAM.com.example.shared")
        #expect(access.appGroup == "TEAM.com.example")
        #expect(access.isExtension)
    }

    @Test("should hand the app's server address to the extension through shared defaults")
    func addressRoundTrip() throws {
        let name = "test.shared-access.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }

        #expect(SharedAccess.publishedBaseURL(from: defaults) == nil)

        SharedAccess.publish(baseURL: "https://api.example", to: defaults)

        #expect(SharedAccess.publishedBaseURL(from: defaults) == "https://api.example")
        #expect(APIClient.resolveBaseURL(saved: SharedAccess.publishedBaseURL(from: defaults), fallback: nil) == "https://api.example")
    }

    @Test("should fall back to the production address when the app has not published one")
    func addressMissing() {
        #expect(APIClient.resolveBaseURL(saved: SharedAccess.publishedBaseURL(from: nil), fallback: nil) == APIClient.productionBaseURLString)
    }
}
