import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("ChatModelStore")
struct ChatModelStoreTests {
    private func freshDefaults() -> UserDefaults {
        let suite = "chat-model-store-\(UUID().uuidString)"

        return UserDefaults(suiteName: suite)!
    }

    @Test("remembers the model picked for later chats")
    func remembersPick() {
        let defaults = freshDefaults()

        ChatModelStore.select("openrouter/google/gemma-4-31b-it", defaults: defaults)

        #expect(ChatModelStore.selectedId(defaults: defaults) == "openrouter/google/gemma-4-31b-it")
    }

    @Test("ignores a model that is not in the allowed list")
    func ignoresUnlisted() {
        let defaults = freshDefaults()

        defaults.set("openrouter/evil/model", forKey: ChatModelStore.key)

        #expect(ChatModelStore.selectedId(defaults: defaults) == nil)
    }
}
