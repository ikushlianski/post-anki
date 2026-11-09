import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("The highlight shortcut defaults to Command+D and can be changed per device")
    struct HighlightShortcutSmokeTests {
        private func store() -> (HighlightShortcutStore, UserDefaults) {
            let defaults = UserDefaults(suiteName: "highlight-shortcut-\(UUID().uuidString)")!

            return (HighlightShortcutStore(defaults: defaults), defaults)
        }

        @Test("should default to Command+D when nothing was chosen")
        func defaultsToCommandD() {
            let (store, _) = store()

            #expect(store.load() == .defaultShortcut)
            #expect(store.load().label == "⌘D")
        }

        @Test("should remember the chosen shortcut and forget it on reset")
        func saveAndReset() {
            let (store, _) = store()
            let chosen = HighlightShortcut(rawValue: "command+shift+h")!

            store.save(chosen)
            #expect(store.load() == chosen)
            #expect(store.load().label == "⇧⌘H")

            store.reset()
            #expect(store.load() == .defaultShortcut)
        }

        @Test("should ignore combos that clash with submit or that cannot be typed safely", arguments: [
            "command+return", "command+\r", "d", "shift+d", "command+", "command+dd", "hyper+d", ""
        ])
        func rejectsClashes(raw: String) {
            #expect(HighlightShortcut(rawValue: raw) == nil)
        }

        @Test("should fall back to the default when the stored value is unusable")
        func fallsBack() {
            let (store, defaults) = store()

            defaults.set("command+return", forKey: HighlightShortcutStore.key)

            #expect(store.load() == .defaultShortcut)
        }

        @Test("should not offer combos that other Mac menu commands or Hide Others already use")
        func avoidsReserved() {
            let labels = HighlightShortcut.choices.map(\.label)

            #expect(!labels.contains("⇧⌘L"))
            #expect(!labels.contains("⌥⌘H"))
        }

        @Test("should offer only valid choices, starting with the default")
        func choicesAreValid() {
            #expect(HighlightShortcut.choices.first == .defaultShortcut)
            #expect(HighlightShortcut.choices.allSatisfy { HighlightShortcut(rawValue: $0.rawValue) == $0 })
        }
    }
}
