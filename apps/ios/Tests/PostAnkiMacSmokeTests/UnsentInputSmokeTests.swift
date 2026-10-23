import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Unsent input blocks reload and is dropped when it should be")
    struct UnsentInputSmokeTests {
        private final class Scope {
            var value = "https://a.example"
        }

        @Test("should report no unsent input when nothing is typed")
        func emptyStoreHasNone() {
            #expect(UnsentDraftStore().hasAny == false)
        }

        @Test("should report unsent input while any draft has text")
        func draftCounts() {
            let store = UnsentDraftStore()

            store.set("half-written question", for: UnsentDraftStore.key("ask"))

            #expect(store.hasAny)
        }

        @Test("should stop reporting input once the draft is cleared or blanked")
        func clearedDraftDoesNotCount() {
            let store = UnsentDraftStore()
            let key = UnsentDraftStore.key("ask")

            store.set("text", for: key)
            store.set("   ", for: key)

            #expect(store.hasAny == false)
        }

        @Test("should drop every draft when the token is removed")
        func resetDropsDrafts() {
            let store = UnsentDraftStore()
            let key = UnsentDraftStore.key("ask")

            store.set("text", for: key)
            store.reset()

            #expect(store.text(for: key) == nil)
            #expect(store.hasAny == false)
        }

        @Test("should flag a draft that was cut at the character limit")
        func flagsClippedDraft() {
            let store = UnsentDraftStore()

            store.set(String(repeating: "a", count: UnsentDraftStore.maxCharacters + 1), for: "long")

            #expect(store.wasClipped(for: "long"))

            store.set("short", for: "long")

            #expect(store.wasClipped(for: "long") == false)
        }

        @Test("should count a source reporting input and release it when it stops")
        func sourcesReport() {
            UnsentInputSources.shared.set("ask", hasInput: true)

            #expect(UnsentInputSources.shared.isEmpty == false)

            UnsentInputSources.shared.set("ask", hasInput: false)

            #expect(UnsentInputSources.shared.isEmpty)
        }

        @Test("should start a fresh Decide session when the server address changes")
        func decideResetsOnServerChange() async {
            let scope = Scope()
            let center = NotificationCenter()
            let model = DecideModel()
            var resets = 0
            let observer = ServerScopeObserver(
                notificationCenter: center,
                scopeProvider: { scope.value }
            ) {
                model.reset()
                resets += 1
            }

            model.decision = "Move to sessions?"
            center.post(name: .postAnkiSettingsDidSave, object: nil)
            await Task.yield()

            #expect(model.decision == "Move to sessions?")

            scope.value = "https://b.example"
            center.post(name: .postAnkiSettingsDidSave, object: nil)
            await Task.yield()

            #expect(model.decision.isEmpty)
            #expect(resets == 1)
            withExtendedLifetime(observer) {}
        }
    }
}
