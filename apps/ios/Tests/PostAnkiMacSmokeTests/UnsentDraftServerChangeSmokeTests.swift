import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Unsent drafts are dropped when the server address changes")
    struct UnsentDraftServerChangeSmokeTests {
        private final class Scope {
            var value = "https://a.example"
        }

        private func makeStore(_ scope: Scope, _ center: NotificationCenter) -> UnsentDraftStore {
            UnsentDraftStore(notificationCenter: center, scopeProvider: { scope.value })
        }

        private func saveSettings(_ center: NotificationCenter) async {
            center.post(name: .postAnkiSettingsDidSave, object: nil)
            await Task.yield()
        }

        @Test("should discard drafts typed for the old server after the address is saved")
        func clearsOnAddressChange() async {
            let scope = Scope()
            let center = NotificationCenter()
            let store = makeStore(scope, center)
            let oldKey = "https://a.example|ask"

            store.set("draft", for: oldKey)
            scope.value = "https://b.example"
            await saveSettings(center)

            #expect(store.text(for: oldKey) == nil)
        }

        @Test("should keep drafts when settings are saved without changing the address")
        func keepsOnSameAddress() async {
            let scope = Scope()
            let center = NotificationCenter()
            let store = makeStore(scope, center)
            let key = "https://a.example|ask"

            store.set("draft", for: key)
            await saveSettings(center)

            #expect(store.text(for: key) == "draft")
        }

        @Test("should keep drafts that already belong to the new server")
        func keepsNewServerDrafts() async {
            let scope = Scope()
            let center = NotificationCenter()
            let store = makeStore(scope, center)
            let newKey = "https://b.example|ask"

            store.set("old", for: "https://a.example|ask")
            store.set("new", for: newKey)
            scope.value = "https://b.example"
            await saveSettings(center)

            #expect(store.text(for: newKey) == "new")
            #expect(store.text(for: "https://a.example|ask") == nil)
        }
    }
}
