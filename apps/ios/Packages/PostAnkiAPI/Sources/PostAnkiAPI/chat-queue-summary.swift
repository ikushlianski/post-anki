import Foundation

public enum ChatQueueSummary {
    public static func counts(_ items: [ChatQueueItem], now: Date = Date()) -> (waiting: Int, snoozed: Int) {
        let snoozed = items.filter { $0.isSnoozed(at: now) }.count

        return (items.count - snoozed, snoozed)
    }

    public static func label(_ items: [ChatQueueItem], now: Date = Date()) -> String? {
        if items.isEmpty { return nil }

        let (waiting, snoozed) = counts(items, now: now)

        if snoozed > 0 { return "\(waiting) waiting · \(snoozed) snoozed" }

        return "\(waiting) waiting"
    }
}
