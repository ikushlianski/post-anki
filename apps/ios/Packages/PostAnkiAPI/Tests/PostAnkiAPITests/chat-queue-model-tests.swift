import Foundation
import Testing
@testable import PostAnkiAPI

@MainActor
private final class Harness {
    var serverItems: [ChatQueueItem]
    var returnError: Error?
    var returnCalls: [String] = []
    var counts: [Int] = []
    var returnGate: CheckedContinuation<Void, Never>?
    var listGate: CheckedContinuation<Void, Never>?
    var holdReturn = false
    var holdList = false

    init(_ ids: [String]) {
        serverItems = ids.map { ChatQueueItem(id: $0, body: $0, chatAt: "2026-10-29T12:00:00.000Z", turnsLeft: 8) }
    }

    func model() -> ChatQueueModel {
        ChatQueueModel(actions: ChatQueueActions(
            list: { [self] in
                let snapshot = ChatQueueList(items: serverItems, count: serverItems.count)

                if holdList { await withCheckedContinuation { listGate = $0 } }

                return snapshot
            },
            returnToInbox: { [self] id in
                returnCalls.append(id)

                if holdReturn { await withCheckedContinuation { returnGate = $0 } }

                if let returnError { throw returnError }

                serverItems.removeAll { $0.id == id }
            },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { [self] in counts.append($0) }
        ))
    }
}

@MainActor
@Suite("Chat queue model")
struct ChatQueueModelTests {
    @Test("returning a card to Inbox removes its row and lowers the Chat count")
    func success() async {
        let harness = Harness(["a", "b"])
        let model = harness.model()

        await model.load()
        await model.returnToInbox("a")

        #expect(model.items.map(\.id) == ["b"])
        #expect(harness.counts.last == 1)
        #expect(model.errorMessage == nil)
    }

    @Test("a card already gone from Chat disappears and shows the not-in-chat message")
    func notInChat() async {
        let harness = Harness(["a", "b"])
        let model = harness.model()

        await model.load()
        harness.returnError = APIError.badStatus(409, "not_in_chat")
        await model.returnToInbox("a")

        #expect(model.items.map(\.id) == ["b"])
        #expect(model.errorMessage == ChatQueueFailure.notInChat.message)
    }

    @Test("a deleted card disappears from the list")
    func notFound() async {
        let harness = Harness(["a", "b"])
        let model = harness.model()

        await model.load()
        harness.returnError = APIError.badStatus(404, "not_found")
        await model.returnToInbox("a")

        #expect(model.items.map(\.id) == ["b"])
        #expect(model.errorMessage == ChatQueueFailure.notFound.message)
    }

    @Test("any other failure keeps the row and shows the error")
    func otherError() async {
        let harness = Harness(["a", "b"])
        let model = harness.model()

        await model.load()
        harness.returnError = URLError(.notConnectedToInternet)
        await model.returnToInbox("a")

        #expect(model.items.map(\.id) == ["a", "b"])
        #expect(model.errorMessage == ChatQueueFailure.offline.message)
    }

    @Test("a second tap on the same card while the first is running is ignored")
    func duplicateIgnored() async {
        let harness = Harness(["a", "b"])
        let model = harness.model()

        await model.load()
        harness.holdReturn = true

        let first = Task { await model.returnToInbox("a") }

        while harness.returnGate == nil { await Task.yield() }

        await model.returnToInbox("a")

        harness.returnGate?.resume()
        await first.value

        #expect(harness.returnCalls == ["a"])
        #expect(model.items.map(\.id) == ["b"])
        #expect(model.errorMessage == nil)
    }

    @Test("a refresh that started before a card moved does not bring its row back")
    func loadDoesNotResurrect() async {
        let harness = Harness(["a", "b"])
        let model = harness.model()

        await model.load()
        harness.holdList = true

        let reload = Task { await model.load() }

        while harness.listGate == nil { await Task.yield() }

        await model.returnToInbox("a")

        harness.holdList = false
        harness.listGate?.resume()
        await reload.value

        #expect(model.items.map(\.id) == ["b"])
        #expect(harness.counts.last == 1)
    }
}
