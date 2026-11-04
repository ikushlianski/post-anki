import Foundation

public enum ChatQueueSortOrder: String, Sendable, CaseIterable {
    case oldest
    case newest
}

public enum ChatQueueWaiting {
    private static let dayMs = 86_400_000.0

    public static func days(chatAt: String, now: Date = Date()) -> Int {
        guard let date = ChatQueueDate.parse(chatAt) else { return 0 }

        let elapsedMs = (now.timeIntervalSince1970 - date.timeIntervalSince1970) * 1000

        guard elapsedMs.isFinite else { return 0 }

        return max(0, Int((elapsedMs / dayMs).rounded(.down)))
    }

    public static let staleDays = 14

    public static func isStale(_ item: ChatQueueItem, now: Date = Date()) -> Bool {
        days(chatAt: item.chatAt, now: now) > staleDays
    }

    public static func stale(_ items: [ChatQueueItem], now: Date = Date()) -> [ChatQueueItem] {
        items.filter { isStale($0, now: now) }
    }

    public static func oldestWaitingDays(_ items: [ChatQueueItem], now: Date = Date()) -> Int {
        items
            .filter { !$0.isSnoozed(at: now) }
            .map { days(chatAt: $0.chatAt, now: now) }
            .max() ?? 0
    }

    public static func oldestWaitLabel(_ items: [ChatQueueItem], now: Date = Date()) -> String? {
        let waited = oldestWaitingDays(items, now: now)

        if waited < 1 { return nil }
        if waited == 1 { return "Oldest card has waited 1 day" }

        return "Oldest card has waited \(waited) days"
    }

    public static func label(days: Int) -> String {
        if days <= 0 { return "waiting today" }
        if days == 1 { return "waiting 1 day" }

        return "waiting \(days) days"
    }

    public static func label(chatAt: String, now: Date = Date()) -> String {
        label(days: days(chatAt: chatAt, now: now))
    }

    public static func sorted(_ items: [ChatQueueItem], order: ChatQueueSortOrder) -> [ChatQueueItem] {
        let keyed = items.enumerated().map { (index: $0.offset, time: ChatQueueDate.parse($0.element.chatAt)?.timeIntervalSince1970 ?? 0, item: $0.element) }
        let sign = order == .oldest ? 1.0 : -1.0

        return keyed.sorted { lhs, rhs in
            let diff = sign * (lhs.time - rhs.time)

            if diff != 0 { return diff < 0 }

            return lhs.index < rhs.index
        }.map(\.item)
    }
}
