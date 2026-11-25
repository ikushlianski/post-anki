import Testing
@testable import PostAnkiAPI

@MainActor
@Suite("Chat queue bulk delete")
struct ChatQueueBulkDeleteTests {
    private final class Log { var deleted: [String] = [] }

    private func loaded(count: Int, failing: Set<String> = [], review: Set<String> = []) async -> (ChatQueueModel, Log) {
        let log = Log()
        var server = (1...count).map { ChatQueueItem(id: "\($0)", body: "\($0)", chatAt: "2020-01-01T12:00:00.000Z", turnsLeft: 8, reviewChat: review.contains("\($0)")) }
        let model = ChatQueueModel(actions: ChatQueueActions(
            list: { ChatQueueList(items: server, count: server.count) },
            returnToInbox: { _ in },
            snooze: { _, _ in },
            unsnooze: { _ in },
            delete: { id in
                if failing.contains(id) { throw APIError.badStatus(500, "boom") }

                log.deleted.append(id)
                server.removeAll { $0.id == id }
            },
            setCount: { _ in }
        ))

        await model.load()

        return (model, log)
    }

    @Test("deleting even one selected chat asks for confirmation and deletes nothing until confirmed")
    func alwaysConfirms() async {
        let (model, log) = await loaded(count: 3)

        model.picked = ["1", "2"]

        let deleted = await model.requestBulk(.delete)
        await model.settleBackgroundActions()

        #expect(deleted == 0)
        #expect(model.isConfirmingBulk)
        #expect(model.confirmingAction == .delete)
        #expect(log.deleted.isEmpty)
    }

    @Test("confirming deletes every selected chat and clears the selection")
    func deletesAllSelected() async {
        let (model, log) = await loaded(count: 4)

        model.picked = ["1", "3", "4"]

        let deleted = await model.runBulk(.delete)
        await model.settleBackgroundActions()

        #expect(deleted == 3)
        #expect(Set(log.deleted) == ["1", "3", "4"])
        #expect(model.items.map(\.id) == ["2"])
        #expect(model.picked.isEmpty)
        #expect(!model.isConfirmingBulk)
    }

    @Test("chats that fail to delete stay selected and are reported")
    func failuresStaySelected() async {
        let (model, _) = await loaded(count: 3, failing: ["2"])

        model.picked = ["1", "2"]
        await model.runBulk(.delete)
        await model.settleBackgroundActions()

        #expect(model.picked == ["2"])
        #expect(model.bulkNotice == "1 card could not be deleted")
    }

    @Test("deleting a mixed selection counts only non-review chats and tells how many review chats were skipped")
    func mixedSelectionSkipsReview() async {
        let (model, log) = await loaded(count: 4, review: ["2", "3"])

        model.picked = ["1", "2", "3"]

        #expect(model.deletableIds == ["1"])

        _ = await model.requestBulk(.delete)
        await model.settleBackgroundActions()

        #expect(model.isConfirmingBulk)
        #expect(log.deleted.isEmpty)

        let deleted = await model.runBulk(.delete)
        await model.settleBackgroundActions()

        #expect(deleted == 1)
        #expect(log.deleted == ["1"])
        #expect(model.picked == ["2", "3"])
        #expect(model.bulkNotice == "2 review chats skipped: use Move to Inbox to clear them")
    }

    @Test("deleting only review chats asks nothing and reports they were skipped")
    func onlyReviewSkipped() async {
        let (model, log) = await loaded(count: 2, review: ["1"])

        model.picked = ["1"]

        let deleted = await model.requestBulk(.delete)
        await model.settleBackgroundActions()

        #expect(deleted == 0)
        #expect(!model.isConfirmingBulk)
        #expect(log.deleted.isEmpty)
        #expect(model.bulkNotice == "1 review chat skipped: use Move to Inbox to clear them")
    }

    @Test("moving a mixed selection to inbox includes review chats")
    func moveIncludesReview() async {
        let (model, _) = await loaded(count: 2, review: ["2"])

        model.picked = ["1", "2"]

        let moved = await model.runBulk(.moveToInbox)
        await model.settleBackgroundActions()

        #expect(moved == 2)
        #expect(model.items.isEmpty)
    }
}
