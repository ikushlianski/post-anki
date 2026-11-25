import Foundation
import Testing
@testable import PostAnkiAPI

@MainActor
private final class BulkHeldHarness {
    var server: [ChatQueueItem]
    var failing: Set<String> = []
    var failure: Error = APIError.badStatus(500, "boom")
    var holding = false
    var gates: [CheckedContinuation<Void, Never>] = []
    var counts: [Int] = []
    var snoozed: [String] = []
    var deleted: [String] = []

    init(_ ids: [String]) {
        server = ids.map { ChatQueueItem(id: $0, body: $0, chatAt: "2026-10-29T12:00:00.000Z", turnsLeft: 8) }
    }

    func model() -> ChatQueueModel {
        ChatQueueModel(actions: ChatQueueActions(
            list: { [self] in ChatQueueList(items: server, count: server.count) },
            returnToInbox: { [self] id in
                try await respond(id)
                server.removeAll { $0.id == id }
            },
            snooze: { [self] id, _ in
                try await respond(id)
                snoozed.append(id)
            },
            unsnooze: { _ in },
            delete: { [self] id in
                try await respond(id)
                deleted.append(id)
                server.removeAll { $0.id == id }
            },
            setCount: { [self] in counts.append($0) }
        ))
    }

    private func respond(_ id: String) async throws {
        if holding { await withCheckedContinuation { gates.append($0) } }

        if failing.contains(id) { throw failure }
    }

    func release(expecting count: Int) async {
        while gates.count < count { await Task.yield() }

        holding = false

        let open = gates

        gates = []
        open.forEach { $0.resume() }
    }
}

@MainActor
@Suite("Chat queue bulk actions never block the list")
struct ChatQueueBulkOptimisticTests {
    @Test("the picked cards leave the list at once and the selection clears while the move request is held")
    func moveIsImmediate() async {
        let harness = BulkHeldHarness(["a", "b", "c"])
        let model = harness.model()

        await model.load()
        model.picked = ["a", "b"]
        harness.holding = true

        let moved = await model.runBulk(.moveToInbox)

        #expect(moved == 2)
        #expect(model.items.map(\.id) == ["c"])
        #expect(model.picked.isEmpty)
        #expect(harness.counts.last == 1)

        await harness.release(expecting: 2)
        await model.settleBackgroundActions()

        #expect(model.items.map(\.id) == ["c"])
        #expect(model.bulkNotice == nil)
    }

    @Test("only the cards whose delete fails come back, in place, with a count message")
    func lateDeleteFailureRestoresOnlyFailedRows() async {
        let harness = BulkHeldHarness(["a", "b", "c"])
        let model = harness.model()

        await model.load()
        model.picked = ["a", "b", "c"]
        harness.failing = ["b"]
        harness.holding = true

        await model.runBulk(.delete)

        #expect(model.items.isEmpty)

        await harness.release(expecting: 3)
        await model.settleBackgroundActions()

        #expect(model.items.map(\.id) == ["b"])
        #expect(model.picked == ["b"])
        #expect(model.bulkNotice == "1 card could not be deleted")
        #expect(Set(harness.deleted) == ["a", "c"])
    }

    @Test("a refresh that lands while the bulk move is held does not bring the moving cards back")
    func refreshWhileHeld() async {
        let harness = BulkHeldHarness(["a", "b", "c"])
        let model = harness.model()

        await model.load()
        model.picked = ["a"]
        harness.holding = true
        await model.runBulk(.moveToInbox)
        await model.load()

        #expect(model.items.map(\.id) == ["b", "c"])
        #expect(harness.counts.last == 2)

        await harness.release(expecting: 1)
        await model.settleBackgroundActions()
    }

    @Test("snoozed cards show as snoozed at once and a failed snooze goes back to waiting")
    func snoozeMarksAndRestores() async {
        let harness = BulkHeldHarness(["a", "b"])
        let model = harness.model()

        await model.load()
        model.picked = ["a", "b"]
        harness.failing = ["b"]
        harness.holding = true

        await model.runBulk(.snooze(days: 3))

        #expect(model.items.allSatisfy { $0.isSnoozed() })

        await harness.release(expecting: 2)
        await model.settleBackgroundActions()

        #expect(model.items.first { $0.id == "a" }?.isSnoozed() == true)
        #expect(model.items.first { $0.id == "b" }?.isSnoozed() == false)
        #expect(model.bulkNotice == "1 card could not be snoozed")
    }

    @Test("a card that was already gone from Chat when the late request failed stays removed")
    func alreadyGoneStaysRemoved() async {
        let harness = BulkHeldHarness(["a"])
        let model = harness.model()

        await model.load()
        harness.failing = ["a"]
        harness.failure = APIError.badStatus(409, "not_in_chat")
        harness.holding = true

        #expect(await model.returnToInbox("a"))

        await harness.release(expecting: 1)
        await model.settleBackgroundActions()

        #expect(model.items.isEmpty)
        #expect(model.errorMessage == ChatQueueFailure.notInChat.message)
    }
}
