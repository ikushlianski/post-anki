import Foundation
import Testing
@testable import PostAnkiAPI

@MainActor
private final class MoveAllHarness {
    var serverItems: [ChatQueueItem]
    var failIds: Set<String> = []
    var calls: [String] = []
    var counts: [Int] = []
    var gate: CheckedContinuation<Void, Never>?
    var hold = false

    init(stale: [String], fresh: [String] = []) {
        let old = "2020-01-01T12:00:00.000Z"
        let now = ISO8601DateFormatter().string(from: Date())

        serverItems = stale.map { ChatQueueItem(id: $0, body: $0, chatAt: old, turnsLeft: 8) }
            + fresh.map { ChatQueueItem(id: $0, body: $0, chatAt: now, turnsLeft: 8) }
    }

    func model() -> ChatQueueModel {
        ChatQueueModel(actions: ChatQueueActions(
            list: { [self] in ChatQueueList(items: serverItems, count: serverItems.count) },
            returnToInbox: { [self] id in
                calls.append(id)

                if hold { await withCheckedContinuation { gate = $0 } }

                if failIds.contains(id) { throw APIError.badStatus(500, "boom") }

                serverItems.removeAll { $0.id == id }
            },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { [self] in counts.append($0) }
        ))
    }
}

@MainActor
@Suite("Chat queue move all stale to Inbox")
struct ChatQueueMoveAllTests {
    @Test("moving all stale cards clears them, keeps fresh ones, and refreshes the count")
    func allSucceed() async {
        let harness = MoveAllHarness(stale: ["a", "b"], fresh: ["c"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        await model.moveAllVisibleToInbox()

        #expect(harness.calls == ["a", "b"])
        #expect(model.items.map(\.id) == ["c"])
        #expect(harness.counts.last == 1)
        #expect(model.errorMessage == nil)
    }

    @Test("cards that fail to move stay in the list with a count message")
    func partialFailure() async {
        let harness = MoveAllHarness(stale: ["a", "b", "c"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        harness.failIds = ["b", "c"]
        await model.moveAllVisibleToInbox()

        #expect(Set(model.items.map(\.id)) == ["b", "c"])
        #expect(model.errorMessage == "2 cards could not be moved")
    }

    @Test("a second trigger while the move is running is ignored")
    func doubleTrigger() async {
        let harness = MoveAllHarness(stale: ["a", "b"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        harness.hold = true

        let first = Task { await model.moveAllVisibleToInbox() }

        await Task.yield()
        await model.moveAllVisibleToInbox()
        harness.hold = false
        harness.gate?.resume()
        await first.value

        #expect(harness.calls == ["a", "b"])
    }

    @Test("nothing happens when the stale filter is off or no stale cards exist")
    func emptyOrInactive() async {
        let harness = MoveAllHarness(stale: ["a"], fresh: ["c"])
        let model = harness.model()

        await model.load()
        await model.moveAllVisibleToInbox()

        #expect(harness.calls.isEmpty)

        let none = MoveAllHarness(stale: [], fresh: ["c"])
        let other = none.model()

        await other.load()
        other.staleOnly = true
        await other.moveAllVisibleToInbox()

        #expect(none.calls.isEmpty)
        #expect(other.items.map(\.id) == ["c"])
    }
}

@MainActor
@Suite("Chat queue single move to Inbox")
struct ChatQueueSingleMoveTests {
    @Test("a double tap moves the card once and only the first call reports the move")
    func doubleTap() async {
        let harness = MoveAllHarness(stale: ["a"])
        let model = harness.model()

        await model.load()
        harness.hold = true

        async let first = model.returnToInbox("a")

        await Task.yield()

        let second = await model.returnToInbox("a")

        harness.gate?.resume()

        #expect(second == false)
        #expect(await first == true)
        #expect(harness.calls == ["a"])
    }

    @Test("a failed move reports no move")
    func failure() async {
        let harness = MoveAllHarness(stale: ["a"])
        let model = harness.model()

        await model.load()
        harness.failIds = ["a"]

        #expect(await model.returnToInbox("a") == false)
    }
}
