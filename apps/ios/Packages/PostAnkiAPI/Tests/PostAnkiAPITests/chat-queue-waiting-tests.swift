import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Chat queue waiting")
struct ChatQueueWaitingTests {
    private let now = ChatQueueDate.parse("2026-10-29T12:00:00.000Z")!

    private func item(_ id: String, _ chatAt: String) -> ChatQueueItem {
        ChatQueueItem(id: id, body: id, chatAt: chatAt, turnsLeft: 8)
    }

    @Test("a card parked a few hours ago shows waiting today")
    func today() {
        #expect(ChatQueueWaiting.label(chatAt: "2026-10-29T03:00:00.000Z", now: now) == "waiting today")
    }

    @Test("a card parked 24 hours ago shows waiting 1 day")
    func oneDay() {
        #expect(ChatQueueWaiting.label(chatAt: "2026-10-28T12:00:00.000Z", now: now) == "waiting 1 day")
    }

    @Test("a card parked 47 hours ago still shows 1 day")
    func floors() {
        #expect(ChatQueueWaiting.days(chatAt: "2026-10-27T13:00:00.000Z", now: now) == 1)
    }

    @Test("a card parked 5 days ago shows waiting 5 days")
    func manyDays() {
        #expect(ChatQueueWaiting.label(chatAt: "2026-10-24T12:00:00Z", now: now) == "waiting 5 days")
    }

    @Test("a future or unparseable timestamp counts as waiting today")
    func clamps() {
        #expect(ChatQueueWaiting.days(chatAt: "2026-11-05T12:00:00.000Z", now: now) == 0)
        #expect(ChatQueueWaiting.days(chatAt: "garbage", now: now) == 0)
    }

    @Test("oldest first puts the longest waiting card on top and keeps ties in order")
    func oldestFirst() {
        let items = [
            item("b", "2026-10-27T00:00:00.000Z"),
            item("c", "2026-10-25T00:00:00.000Z"),
            item("a", "2026-10-27T00:00:00.000Z"),
            item("d", "2026-10-28T00:00:00.000Z")
        ]

        #expect(ChatQueueWaiting.sorted(items, order: .oldest).map(\.id) == ["c", "b", "a", "d"])
    }

    @Test("newest first reverses the order and keeps ties in order")
    func newestFirst() {
        let items = [
            item("b", "2026-10-27T00:00:00.000Z"),
            item("c", "2026-10-25T00:00:00.000Z"),
            item("a", "2026-10-27T00:00:00.000Z"),
            item("d", "2026-10-28T00:00:00.000Z")
        ]

        #expect(ChatQueueWaiting.sorted(items, order: .newest).map(\.id) == ["d", "b", "a", "c"])
    }
}

@Suite("Chat queue stale filter")
struct ChatQueueStaleFilterTests {
    private let now = ChatQueueDate.parse("2026-10-29T12:00:00.000Z")!

    private func item(_ id: String, _ chatAt: String) -> ChatQueueItem {
        ChatQueueItem(id: id, body: id, chatAt: chatAt, turnsLeft: 8)
    }

    @Test("a card waiting exactly 14 days is not stale but 15 days is")
    func boundary() {
        let items = [item("a", "2026-10-15T12:00:00.000Z"), item("b", "2026-10-14T12:00:00.000Z")]

        #expect(ChatQueueWaiting.stale(items, now: now).map(\.id) == ["b"])
    }

    @Test("no stale cards means the chip has nothing to show")
    func none() {
        #expect(ChatQueueWaiting.stale([item("a", "2026-10-28T12:00:00.000Z")], now: now).isEmpty)
    }

    @MainActor
    private func model(_ items: [ChatQueueItem]) async -> ChatQueueModel {
        let model = ChatQueueModel(actions: ChatQueueActions(
            list: { ChatQueueList(items: items, count: items.count) },
            returnToInbox: { _ in },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { _ in }
        ))

        await model.load()

        return model
    }

    @Test("stale filter keeps only old cards, composes with sort, and restores the list when off")
    @MainActor
    func composes() async {
        let items = [
            item("new", "2026-10-28T12:00:00.000Z"),
            item("old1", "2000-01-01T00:00:00.000Z"),
            item("old2", "2001-01-01T00:00:00.000Z"),
        ]
        let model = await model(items)

        model.staleOnly = true
        #expect(model.hasStaleItems)
        #expect(model.sortedItems.map(\.id) == ["old1", "old2"])

        model.sortOrder = .newest
        #expect(model.sortedItems.map(\.id) == ["old2", "old1"])

        model.staleOnly = false
        #expect(model.sortedItems.count == 3)
    }

    @Test("with no stale cards the filter does nothing")
    @MainActor
    func inactive() async {
        let model = await model([item("a", "2999-01-01T00:00:00.000Z")])

        model.staleOnly = true
        #expect(!model.hasStaleItems)
        #expect(model.sortedItems.map(\.id) == ["a"])
    }
}

@Suite("Chat queue oldest wait")
struct ChatQueueOldestWaitTests {
    private let now = ChatQueueDate.parse("2026-10-29T12:00:00.000Z")!

    private func item(_ id: String, _ chatAt: String, snoozedUntil: Date? = nil) -> ChatQueueItem {
        ChatQueueItem(id: id, body: id, chatAt: chatAt, turnsLeft: 8, snoozedUntil: snoozedUntil)
    }

    @Test("the caption names the longest wait among cards in the list")
    func oldest() {
        let items = [item("a", "2026-10-26T12:00:00.000Z"), item("b", "2026-10-20T12:00:00.000Z")]

        #expect(ChatQueueWaiting.oldestWaitLabel(items, now: now) == "Oldest card has waited 9 days")
    }

    @Test("a single day uses the singular form")
    func singular() {
        #expect(ChatQueueWaiting.oldestWaitLabel([item("a", "2026-10-28T12:00:00.000Z")], now: now) == "Oldest card has waited 1 day")
    }

    @Test("nothing is shown when every card was parked today or the list is empty")
    func hidden() {
        #expect(ChatQueueWaiting.oldestWaitLabel([item("a", "2026-10-29T03:00:00.000Z")], now: now) == nil)
        #expect(ChatQueueWaiting.oldestWaitLabel([], now: now) == nil)
    }

    @Test("snoozed cards do not count toward the oldest wait")
    func snoozed() {
        let later = now.addingTimeInterval(86_400)
        let items = [item("a", "2026-10-01T12:00:00.000Z", snoozedUntil: later), item("b", "2026-10-27T12:00:00.000Z")]

        #expect(ChatQueueWaiting.oldestWaitLabel(items, now: now) == "Oldest card has waited 2 days")
    }
}
