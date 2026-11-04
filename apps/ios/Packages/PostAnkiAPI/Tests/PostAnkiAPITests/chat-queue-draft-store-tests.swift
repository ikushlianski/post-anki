import Foundation
import Testing
@testable import PostAnkiAPI

private func freshDefaults() -> UserDefaults {
    let name = "chat-queue-draft-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!

    defaults.removePersistentDomain(forName: name)

    return defaults
}

struct ChatQueueDraftStoreTests {
    @Test func shouldRestoreAnUnsentDraftInALaterLaunch() {
        let defaults = freshDefaults()

        UserDefaultsChatQueueDraftStore(defaults: defaults).save("why is this true?", cardId: "a")

        #expect(UserDefaultsChatQueueDraftStore(defaults: defaults).load(cardId: "a") == "why is this true?")
    }

    @Test func shouldKeepDraftsSeparatePerCard() {
        let store = UserDefaultsChatQueueDraftStore(defaults: freshDefaults())

        store.save("one", cardId: "a")
        store.save("two", cardId: "b")

        #expect(store.load(cardId: "a") == "one")
        #expect(store.load(cardId: "b") == "two")
        #expect(store.load(cardId: "c") == "")
    }

    @Test func shouldDropTheStoredDraftWhenSavedEmpty() {
        let defaults = freshDefaults()
        let store = UserDefaultsChatQueueDraftStore(defaults: defaults)

        store.save("typed", cardId: "a")
        store.save("", cardId: "a")

        #expect(defaults.object(forKey: UserDefaultsChatQueueDraftStore.key("a")) == nil)
    }

    @Test func shouldClearOnlyTheGivenCard() {
        let store = UserDefaultsChatQueueDraftStore(defaults: freshDefaults())

        store.save("one", cardId: "a")
        store.save("two", cardId: "b")
        store.clear(cardId: "a")

        #expect(store.load(cardId: "a") == "")
        #expect(store.load(cardId: "b") == "two")
    }

    @Test func shouldCapDraftsAtTheMessageLimit() {
        let store = UserDefaultsChatQueueDraftStore(defaults: freshDefaults())

        store.save(String(repeating: "x", count: ChatQueueLimits.maxMessageChars + 50), cardId: "a")

        #expect(store.load(cardId: "a").count == ChatQueueLimits.maxMessageChars)
    }

    @Test func shouldCopyReplyTextTrimmedAndSkipBlankReplies() {
        #expect(ChatQueueReplyCopy.text(for: "  answer\n") == "answer")
        #expect(ChatQueueReplyCopy.text(for: " \n ") == nil)
    }
}

struct ChatQueueDraftClearTests {
    @Test func shouldForgetAnInMemoryDraftOnceCleared() {
        let store = InMemoryChatQueueDraftStore()

        store.save("typed", cardId: "a")
        store.clear(cardId: "a")

        #expect(store.load(cardId: "a") == "")
    }
}
