import Testing
@testable import PostAnkiAPI

@MainActor
@Suite("Chat queue bulk move to Inbox")
struct ChatQueueBulkModelTests {
    private func model(ids: [String], failing: Set<String>) -> ChatQueueModel {
        var server = ids.map { ChatQueueItem(id: $0, body: $0, chatAt: "2020-01-01T12:00:00.000Z", turnsLeft: 8) }

        return ChatQueueModel(actions: ChatQueueActions(
            list: { ChatQueueList(items: server, count: server.count) },
            returnToInbox: { id in
                if failing.contains(id) { throw APIError.badStatus(500, "boom") }

                server.removeAll { $0.id == id }
            },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { _ in }
        ))
    }

    @Test("failed cards stay selected and the notice reports how many failed")
    func failedStaySelected() async {
        let model = model(ids: ["a", "b", "c"], failing: ["b"])

        await model.load()
        model.picked = ["a", "b", "c"]

        let moved = await model.runBulk(.moveToInbox)

        #expect(moved == 2)
        #expect(model.picked == ["b"])
        #expect(model.items.map(\.id) == ["b"])
        #expect(model.bulkNotice == "1 card could not be moved")
    }

    @Test("a fully successful move empties the selection with no notice")
    func allMoved() async {
        let model = model(ids: ["a", "b"], failing: [])

        await model.load()
        model.picked = ["a", "b"]
        await model.runBulk(.moveToInbox)

        #expect(model.picked.isEmpty)
        #expect(model.items.isEmpty)
        #expect(model.bulkNotice == nil)
    }
}

@MainActor
@Suite("Chat queue bulk confirm and selection")
struct ChatQueueBulkConfirmTests {
    private func loaded(count: Int) async -> (ChatQueueModel, Counter) {
        let counter = Counter()
        var server = (1...count).map { ChatQueueItem(id: "\($0)", body: "\($0)", chatAt: "2020-01-01T12:00:00.000Z", turnsLeft: 8) }
        let model = ChatQueueModel(actions: ChatQueueActions(
            list: { ChatQueueList(items: server, count: server.count) },
            returnToInbox: { id in
                counter.calls += 1
                server.removeAll { $0.id == id }
            },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { _ in }
        ))

        await model.load()

        return (model, counter)
    }

    @MainActor final class Counter { var calls = 0 }

    @Test("a context-menu move of more than five selected cards asks for confirmation before moving anything")
    func contextMenuConfirms() async {
        let (model, counter) = await loaded(count: 8)

        model.picked = Set(["1", "2", "3", "4", "5", "6"])

        let moved = await model.requestBulk(.moveToInbox, on: "3")

        #expect(moved == 0)
        #expect(model.isConfirmingBulk)
        #expect(counter.calls == 0)

        let confirmed = await model.runBulk(.moveToInbox)

        #expect(confirmed == 6)
        #expect(!model.isConfirmingBulk)
    }

    @Test("a context-menu move on an unselected card moves only that card without confirmation")
    func contextMenuSingle() async {
        let (model, counter) = await loaded(count: 8)

        model.picked = Set(["1", "2", "3", "4", "5", "6"])

        let moved = await model.requestBulk(.moveToInbox, on: "8")

        #expect(moved == 1)
        #expect(counter.calls == 1)
        #expect(!model.isConfirmingBulk)
    }

    @Test("stale selected ids that are no longer in the list count for nothing and are never moved")
    func staleIdsIgnored() async {
        let (model, counter) = await loaded(count: 8)

        model.picked = Set(["1", "2", "3", "4", "5", "ghost"])

        #expect(model.pickedIds.count == 5)

        let moved = await model.requestBulk(.moveToInbox)

        #expect(moved == 5)
        #expect(counter.calls == 5)
    }

    @Test("cards that disappear from the list drop out of the selection")
    func selectionPruned() async {
        let (model, _) = await loaded(count: 3)

        model.picked = Set(["1", "2"])
        model.resolved("1")

        #expect(model.picked == ["2"])
    }
}
