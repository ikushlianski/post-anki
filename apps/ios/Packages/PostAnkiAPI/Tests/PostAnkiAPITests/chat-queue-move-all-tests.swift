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
        await model.settleBackgroundActions()

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
        await model.settleBackgroundActions()

        #expect(Set(model.items.map(\.id)) == ["b", "c"])
        #expect(model.errorMessage == "2 cards could not be moved")
    }

    @Test("a second trigger right after the first moves nothing more and the server is called once per card")
    func doubleTrigger() async {
        let harness = MoveAllHarness(stale: ["a", "b"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true

        let first = await model.moveAllVisibleToInbox()
        let second = await model.moveAllVisibleToInbox()
        await model.settleBackgroundActions()

        #expect(first == 2)
        #expect(second == 0)
        #expect(harness.calls == ["a", "b"])
    }

    @Test("the cards leave the list at once while the server request is still held")
    func removedWhileHeld() async {
        let harness = MoveAllHarness(stale: ["a", "b"], fresh: ["c"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        harness.hold = true

        let moved = await model.moveAllVisibleToInbox()

        #expect(moved == 2)
        #expect(model.items.map(\.id) == ["c"])
        #expect(harness.counts.last == 1)

        while harness.gate == nil { await Task.yield() }

        harness.hold = false
        harness.gate?.resume()
        await model.settleBackgroundActions()

        #expect(model.items.map(\.id) == ["c"])
    }

    @Test("a refresh that lands while the move is still held does not bring the moving cards back")
    func refreshWhileHeld() async {
        let harness = MoveAllHarness(stale: ["a", "b"], fresh: ["c"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        harness.hold = true
        await model.moveAllVisibleToInbox()
        await model.load()

        #expect(model.items.map(\.id) == ["c"])

        while harness.gate == nil { await Task.yield() }

        harness.hold = false
        harness.gate?.resume()
        await model.settleBackgroundActions()
    }

    @Test("nothing happens when the stale filter is off or no stale cards exist")
    func emptyOrInactive() async {
        let harness = MoveAllHarness(stale: ["a"], fresh: ["c"])
        let model = harness.model()

        await model.load()
        await model.moveAllVisibleToInbox()
        await model.settleBackgroundActions()

        #expect(harness.calls.isEmpty)

        let none = MoveAllHarness(stale: [], fresh: ["c"])
        let other = none.model()

        await other.load()
        other.staleOnly = true
        await other.moveAllVisibleToInbox()
        await other.settleBackgroundActions()

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

        let first = await model.returnToInbox("a")
        let second = await model.returnToInbox("a")
        await model.settleBackgroundActions()

        #expect(first == true)
        #expect(second == false)
        #expect(harness.calls == ["a"])
    }

    @Test("a failed move puts the card back in its place with a message once the server answers")
    func failure() async {
        let harness = MoveAllHarness(stale: ["a", "b"])
        let model = harness.model()

        await model.load()
        harness.failIds = ["a"]

        #expect(await model.returnToInbox("a") == true)
        #expect(model.items.map(\.id) == ["b"])

        await model.settleBackgroundActions()

        #expect(model.items.map(\.id) == ["a", "b"])
        #expect(model.errorMessage != nil)
    }

    @Test("the card leaves the list at once while its request is held and the next card can still be moved")
    func nextActionWhileHeld() async {
        let harness = MoveAllHarness(stale: ["a", "b"])
        let model = harness.model()

        await model.load()
        harness.hold = true

        #expect(await model.returnToInbox("a") == true)
        #expect(model.items.map(\.id) == ["b"])

        while harness.gate == nil { await Task.yield() }

        harness.hold = false

        #expect(await model.returnToInbox("b") == true)
        #expect(model.items.isEmpty)

        while harness.calls.count < 2 { await Task.yield() }

        harness.gate?.resume()
        await model.settleBackgroundActions()

        #expect(model.items.isEmpty)
        #expect(model.errorMessage == nil)
    }
}
