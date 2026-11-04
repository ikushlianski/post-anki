import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Add draft store")
struct AddDraftStoreTests {
    private func stores() -> [AddDraftStoring] {
        let suite = "add-draft-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!

        defaults.removePersistentDomain(forName: suite)

        return [InMemoryAddDraftStore(), UserDefaultsAddDraftStore(defaults: defaults)]
    }

    @Test("should restore the text that was typed before the app closed")
    func restores() {
        for store in stores() {
            store.save("https://example.com/post", key: "a")

            #expect(store.load(key: "a") == "https://example.com/post")
            #expect(store.load(key: "b") == "")
        }
    }

    @Test("should forget the draft after it is cleared or blanked")
    func clears() {
        for store in stores() {
            store.save("hello", key: "a")
            store.clear(key: "a")

            #expect(store.load(key: "a") == "")

            store.save("hello", key: "a")
            store.save("   \n", key: "a")

            #expect(store.load(key: "a") == "")
        }
    }

    @Test("should cap a very long draft")
    func caps() {
        for store in stores() {
            store.save(String(repeating: "x", count: AddDraftLimits.maxChars + 500), key: "a")

            #expect(store.load(key: "a").count == AddDraftLimits.maxChars)
        }
    }

    @Test("should drop every draft on sign-out")
    func clearAll() {
        for store in stores() {
            store.save("one", key: "a")
            store.save("two", key: "b")
            store.clearAll()

            #expect(store.load(key: "a") == "")
            #expect(store.load(key: "b") == "")
        }
    }

    @Test("should survive a new store instance over the same defaults")
    func persists() {
        let suite = "add-draft-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!

        UserDefaultsAddDraftStore(defaults: defaults).save("kept", key: "a")

        #expect(UserDefaultsAddDraftStore(defaults: defaults).load(key: "a") == "kept")

        defaults.removePersistentDomain(forName: suite)
    }
}
