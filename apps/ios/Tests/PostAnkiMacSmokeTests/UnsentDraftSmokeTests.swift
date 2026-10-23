import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Unsent drafts survive switching screens")
    struct UnsentDraftSmokeTests {
        @Test("should hand back the text typed before leaving a screen")
        func restoresDraft() {
            let store = UnsentDraftStore()
            let key = UnsentDraftStore.key("ask")

            store.set("why do we use refresh tokens?", for: key)

            #expect(store.text(for: key) == "why do we use refresh tokens?")
        }

        @Test("should keep drafts for different subjects apart")
        func keysBySubject() {
            let store = UnsentDraftStore()

            store.set("one", for: UnsentDraftStore.key("writing-check", "s1"))
            store.set("two", for: UnsentDraftStore.key("writing-check", "s2"))

            #expect(store.text(for: UnsentDraftStore.key("writing-check", "s1")) == "one")
            #expect(store.text(for: UnsentDraftStore.key("writing-check", "s2")) == "two")
        }

        @Test("should drop a draft once it is emptied or sent")
        func clearsDraft() {
            let store = UnsentDraftStore()
            let key = UnsentDraftStore.key("ask")

            store.set("draft", for: key)
            store.set("   ", for: key)

            #expect(store.text(for: key) == nil)
        }

        @Test("should cap a draft's length and the number of drafts kept")
        func boundsSize() {
            let store = UnsentDraftStore()

            store.set(String(repeating: "a", count: UnsentDraftStore.maxCharacters + 500), for: "long")

            #expect(store.text(for: "long")?.count == UnsentDraftStore.maxCharacters)

            for index in 0..<(UnsentDraftStore.maxDrafts + 5) {
                store.set("text", for: "k\(index)")
            }

            #expect(store.text(for: "k0") == nil)
            #expect(store.text(for: "k\(UnsentDraftStore.maxDrafts + 4)") == "text")
        }
    }
}
