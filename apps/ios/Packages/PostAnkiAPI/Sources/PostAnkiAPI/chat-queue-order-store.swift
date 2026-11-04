import Foundation

public protocol ChatQueueOrderStoring {
    func load() -> ChatQueueSortOrder
    func save(_ order: ChatQueueSortOrder)
}

public struct UserDefaultsChatQueueOrderStore: ChatQueueOrderStoring {
    public static let key = "postanki.chat-queue.order"

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load() -> ChatQueueSortOrder {
        defaults.string(forKey: Self.key).flatMap(ChatQueueSortOrder.init(rawValue:)) ?? .oldest
    }

    public func save(_ order: ChatQueueSortOrder) {
        defaults.set(order.rawValue, forKey: Self.key)
    }
}

public final class InMemoryChatQueueOrderStore: ChatQueueOrderStoring {
    public private(set) var saved: [ChatQueueSortOrder] = []

    private var order: ChatQueueSortOrder

    public init(order: ChatQueueSortOrder = .oldest) {
        self.order = order
    }

    public func load() -> ChatQueueSortOrder { order }

    public func save(_ order: ChatQueueSortOrder) {
        self.order = order
        saved.append(order)
    }
}
