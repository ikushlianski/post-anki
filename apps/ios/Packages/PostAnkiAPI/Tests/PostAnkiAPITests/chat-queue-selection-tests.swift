import Testing
@testable import PostAnkiAPI

@MainActor
@Suite("Chat queue selection")
struct ChatQueueSelectionTests {
    private func loaded() async -> ChatQueueModel {
        let items = (1...5).map {
            ChatQueueItem(id: "\($0)", body: "\($0)", chatAt: "2020-01-0\($0)T12:00:00.000Z", turnsLeft: 8, reviewChat: $0 == 3)
        }
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

    @Test("ticking a chat keeps the other ticked chats and unticking removes only that one")
    func toggleKeepsOthers() async {
        let model = await loaded()

        model.togglePicked("1")
        model.togglePicked("2")
        model.togglePicked("1")

        #expect(model.picked == ["2"])
    }

    @Test("review chats can be ticked like any other chat")
    func reviewSelectable() async {
        let model = await loaded()

        model.togglePicked("3")

        #expect(model.picked == ["3"])
    }

    @Test("shift-click selects every chat between the last clicked and the new one, review chats included")
    func rangeFromAnchor() async {
        let model = await loaded()
        let order = model.sortedItems.map(\.id)

        model.togglePicked(order[0])
        model.pickRange(to: order[3])

        #expect(model.picked == Set(order[0...3]))
        #expect(model.picked.contains("3"))
    }

    @Test("shift-click without a previous click selects just that chat")
    func rangeWithoutAnchor() async {
        let model = await loaded()

        model.pickRange(to: "2")

        #expect(model.picked == ["2"])
    }

    @Test("select all picks every chat and a second toggle clears them")
    func selectAllToggle() async {
        let model = await loaded()

        model.toggleAllPicked()

        #expect(model.picked == ["1", "2", "3", "4", "5"])
        #expect(model.allPicked)

        model.toggleAllPicked()

        #expect(model.picked.isEmpty)
    }
}
