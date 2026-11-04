import Foundation
import Testing
@testable import PostAnkiAPI

@MainActor
private final class ReloadHarness {
    var serverItems: [ChatQueueItem]
    var listGates: [CheckedContinuation<Void, Never>] = []
    var holdList = false
    var counts: [Int] = []

    init(stale: [String]) {
        let old = "2020-01-01T12:00:00.000Z"

        serverItems = stale.map { ChatQueueItem(id: $0, body: $0, chatAt: old, turnsLeft: 8) }
    }

    func model() -> ChatQueueModel {
        ChatQueueModel(actions: ChatQueueActions(
            list: { [self] in
                let snapshot = serverItems

                if holdList { await withCheckedContinuation { listGates.append($0) } }

                return ChatQueueList(items: snapshot, count: snapshot.count)
            },
            returnToInbox: { [self] id in serverItems.removeAll { $0.id == id } },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { [self] in counts.append($0) }
        ))
    }

    func waitForListGate() async {
        while listGates.isEmpty { await Task.yield() }
    }

    func releaseList() {
        let gates = listGates

        listGates = []
        holdList = false
        gates.forEach { $0.resume() }
    }
}

@MainActor
@Suite("Chat queue reload during move all")
struct ChatQueueMoveAllReloadTests {
    @Test("a pull-to-refresh still in flight while cards are moved never brings the moved cards back")
    func reloadInFlightDuringMove() async {
        let harness = ReloadHarness(stale: ["a", "b", "c"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        harness.holdList = true

        let reload = Task { await model.load() }

        await harness.waitForListGate()
        await model.moveAllVisibleToInbox()
        harness.releaseList()
        await reload.value

        #expect(model.items.isEmpty)
        #expect(harness.counts.last == 0)
    }

    @Test("a stale refresh answer arriving after the move finished never brings the moved cards back")
    func reloadResolvesAfterMove() async {
        let harness = ReloadHarness(stale: ["a", "b"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        harness.holdList = true

        let reload = Task { await model.load() }

        await harness.waitForListGate()

        let move = Task { await model.moveAllVisibleToInbox() }

        await move.value
        #expect(model.items.isEmpty)

        harness.releaseList()
        await reload.value

        #expect(model.items.isEmpty)
        #expect(model.isLoading == false)
    }

    @Test("a refresh started after the move finished keeps the moved cards gone")
    func reloadAfterMoveIsFresh() async {
        let harness = ReloadHarness(stale: ["a", "b"])
        let model = harness.model()

        await model.load()
        model.staleOnly = true
        await model.moveAllVisibleToInbox()
        await model.load()

        #expect(model.items.isEmpty)
    }
}
