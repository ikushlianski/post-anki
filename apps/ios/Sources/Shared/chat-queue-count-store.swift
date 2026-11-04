import Observation
import PostAnkiAPI

enum ChatQueueBadge {
    static func text(count: Int, isStale: Bool) -> String? {
        if isStale { return "?" }

        return count > 0 ? String(count) : nil
    }

    static func accessibilityLabel(count: Int, isStale: Bool) -> String {
        if isStale { return "Chat queue, count unavailable" }

        return count > 0 ? "Chat queue, \(count) waiting" : "Chat queue"
    }
}

@Observable
@MainActor
final class ChatQueueCountStore {
    static let shared = ChatQueueCountStore()

    private(set) var count = 0
    private(set) var isStale = false

    private init() {}

    var badgeText: String? { ChatQueueBadge.text(count: count, isStale: isStale) }

    var badgeAccessibilityLabel: String { ChatQueueBadge.accessibilityLabel(count: count, isStale: isStale) }

    func set(_ value: Int) {
        count = max(0, value)
    }

    func adjust(by delta: Int) {
        count = max(0, count + delta)
    }

    func refresh() async {
        guard let list = try? await APIClient.listChatQueue() else {
            isStale = true

            return
        }

        count = max(0, list.count)
        isStale = false
    }
}
