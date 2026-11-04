import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Chat queue summary")
struct ChatQueueSummaryTests {
    private let now = ChatQueueDate.parse("2026-10-29T12:00:00.000Z")!

    private func item(_ id: String, snoozedUntil: Date? = nil) -> ChatQueueItem {
        ChatQueueItem(id: id, body: id, chatAt: "2026-10-20T12:00:00.000Z", turnsLeft: 8, snoozedUntil: snoozedUntil)
    }

    @Test("the header shows waiting and snoozed counts across all cards")
    func both() {
        let later = now.addingTimeInterval(86_400)
        let items = [item("a"), item("b", snoozedUntil: later), item("c"), item("d", snoozedUntil: later)]

        #expect(ChatQueueSummary.label(items, now: now) == "2 waiting · 2 snoozed")
    }

    @Test("the snoozed part is omitted when nothing is snoozed")
    func noSnoozed() {
        #expect(ChatQueueSummary.label([item("a"), item("b")], now: now) == "2 waiting")
    }

    @Test("nothing is shown for an empty queue")
    func empty() {
        #expect(ChatQueueSummary.label([], now: now) == nil)
    }

    @Test("a card whose snooze has expired counts as waiting")
    func expired() {
        let earlier = now.addingTimeInterval(-60)

        #expect(ChatQueueSummary.label([item("a", snoozedUntil: earlier)], now: now) == "1 waiting")
    }

    @Test("when every card is snoozed the waiting count is zero")
    func allSnoozed() {
        let later = now.addingTimeInterval(60)

        #expect(ChatQueueSummary.label([item("a", snoozedUntil: later)], now: now) == "0 waiting · 1 snoozed")
    }
}
