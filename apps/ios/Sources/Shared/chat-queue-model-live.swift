import PostAnkiAPI

extension ChatQueueModel {
    static func live(counts: ChatQueueCountStore = .shared) -> ChatQueueModel {
        ChatQueueModel(actions: ChatQueueActions(
            list: { try await APIClient.listChatQueue() },
            returnToInbox: { try await APIClient.returnFromChatQueue(id: $0) },
            snooze: { _ = try await APIClient.snoozeChatQueue(id: $0, days: $1) },
            unsnooze: { try await APIClient.unsnoozeChatQueue(id: $0) },
            setCount: { counts.set($0) }
        ), orderStore: UserDefaultsChatQueueOrderStore())
    }
}
