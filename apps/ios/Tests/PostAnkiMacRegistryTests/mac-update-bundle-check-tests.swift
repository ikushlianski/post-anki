import Testing
@testable import PostAnkiMac

struct MacUpdateBundleCheckTests {
    private let current = MacUpdateVersion(tag: "0.1.4")!

    private func info(id: String = "com.ikushlianski.postankimac", version: String = "0.1.5") -> [String: Any] {
        ["CFBundleIdentifier": id, "CFBundleShortVersionString": version]
    }

    private func check(_ info: [String: Any]) -> MacUpdateBundleCheck.Failure? {
        MacUpdateBundleCheck.validate(info: info, currentVersion: current, expectedTag: "v0.1.5", bundleID: "com.ikushlianski.postankimac")
    }

    @Test func shouldAcceptTheAppPublishedForThisTag() {
        #expect(check(info()) == nil)
    }

    @Test func shouldRejectAnAppWithAnotherBundleID() {
        #expect(check(info(id: "com.evil.app")) == .wrongBundleID)
    }

    @Test func shouldRejectAnAppThatIsNotNewerThanTheRunningOne() {
        let result = MacUpdateBundleCheck.validate(
            info: info(version: "0.1.5"), currentVersion: MacUpdateVersion(tag: "0.1.5")!,
            expectedTag: "v0.1.5", bundleID: "com.ikushlianski.postankimac"
        )

        #expect(result == .notNewer)
    }

    @Test func shouldRejectAnAppWhoseVersionDiffersFromTheTag() {
        #expect(check(info(version: "0.1.6")) == .versionMismatch)
    }

    @Test func shouldRejectAnAppMissingItsIdentityKeys() {
        #expect(check([:]) == .missingKeys)
    }
}
