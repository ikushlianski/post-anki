import Foundation

public protocol ChatQueueDraftStoring {
    func load(cardId: String) -> String
    func save(_ draft: String, cardId: String)
    func clear(cardId: String)
}

public struct UserDefaultsChatQueueDraftStore: ChatQueueDraftStoring {
    public static let keyPrefix = "postanki.chat-queue.draft."

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load(cardId: String) -> String {
        String((defaults.string(forKey: Self.key(cardId)) ?? "").prefix(ChatQueueLimits.maxMessageChars))
    }

    public func save(_ draft: String, cardId: String) {
        if draft.isEmpty {
            clear(cardId: cardId)
        } else {
            defaults.set(String(draft.prefix(ChatQueueLimits.maxMessageChars)), forKey: Self.key(cardId))
        }
    }

    public func clear(cardId: String) {
        defaults.removeObject(forKey: Self.key(cardId))
    }

    public func clearAll() {
        for name in defaults.dictionaryRepresentation().keys where name.hasPrefix(Self.keyPrefix) {
            defaults.removeObject(forKey: name)
        }
    }

    static func key(_ cardId: String) -> String { "\(keyPrefix)\(cardId)" }
}

public final class InMemoryChatQueueDraftStore: ChatQueueDraftStoring {
    private var drafts: [String: String] = [:]

    public init() {}

    public func load(cardId: String) -> String { drafts[cardId] ?? "" }

    public func save(_ draft: String, cardId: String) {
        if draft.isEmpty { drafts[cardId] = nil } else { drafts[cardId] = draft }
    }

    public func clear(cardId: String) { drafts[cardId] = nil }
}
