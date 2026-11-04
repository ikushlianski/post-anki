import Foundation
import Testing
@testable import PostAnkiAPI

@MainActor
private func model(_ store: ChatQueueOrderStoring) -> ChatQueueModel {
    ChatQueueModel(
        actions: ChatQueueActions(
            list: { ChatQueueList(items: [], count: 0) },
            returnToInbox: { _ in },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { _ in }
        ),
        orderStore: store
    )
}

private func freshDefaults() -> UserDefaults {
    let name = "chat-queue-order-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!

    defaults.removePersistentDomain(forName: name)

    return defaults
}

@MainActor
struct ChatQueueOrderPersistenceTests {
    @Test func shouldDefaultToOldestWhenNothingIsStored() {
        #expect(model(UserDefaultsChatQueueOrderStore(defaults: freshDefaults())).sortOrder == .oldest)
    }

    @Test func shouldRestoreNewestChosenInAnEarlierLaunch() {
        #expect(model(InMemoryChatQueueOrderStore(order: .newest)).sortOrder == .newest)
    }

    @Test func shouldFallBackToOldestWhenStoredValueIsUnknown() {
        let defaults = freshDefaults()

        defaults.set("sideways", forKey: UserDefaultsChatQueueOrderStore.key)

        #expect(model(UserDefaultsChatQueueOrderStore(defaults: defaults)).sortOrder == .oldest)
    }

    @Test func shouldPersistWhenTheUserChangesTheOrder() {
        let defaults = freshDefaults()
        let first = model(UserDefaultsChatQueueOrderStore(defaults: defaults))

        first.sortOrder = .newest

        #expect(model(UserDefaultsChatQueueOrderStore(defaults: defaults)).sortOrder == .newest)
    }

    @Test func shouldNotWriteOnInitOrWhenOrderIsUnchanged() {
        let store = InMemoryChatQueueOrderStore(order: .newest)
        let m = model(store)

        m.sortOrder = .newest

        #expect(store.saved.isEmpty)

        m.sortOrder = .oldest

        #expect(store.saved == [.oldest])
    }
}
