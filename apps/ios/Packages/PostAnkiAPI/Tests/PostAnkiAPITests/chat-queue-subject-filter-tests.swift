import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Chat queue subject filter")
struct ChatQueueSubjectFilterTests {
    private func item(_ id: String, subject: String?, chatAt: String = "2026-10-29T10:00:00.000Z") -> ChatQueueItem {
        ChatQueueItem(id: id, body: id, subjectName: subject, chatAt: chatAt, turnsLeft: 8)
    }

    @Test("should list each subject once, sorted, skipping cards without one")
    func lists() {
        let items = [item("1", subject: "Net"), item("2", subject: "bio"), item("3", subject: "Net"), item("4", subject: nil), item("5", subject: " ")]

        #expect(ChatQueueSubjectFilter.subjects(items) == ["bio", "Net"])
    }

    @Test("should keep only cards of the chosen subject")
    func filters() {
        let items = [item("1", subject: "Net"), item("2", subject: "Bio")]

        #expect(ChatQueueSubjectFilter.apply(items, subject: "Net").map(\.id) == ["1"])
        #expect(ChatQueueSubjectFilter.apply(items, subject: nil).map(\.id) == ["1", "2"])
    }

    @Test("should offer parent subjects and match their sub-subjects when a parent is chosen")
    func nested() {
        let items = [
            item("1", subject: "Business › Sales › Cold sales"),
            item("2", subject: "Business › Sales"),
            item("3", subject: "Business › Salesforce"),
            item("4", subject: "Bio"),
        ]

        #expect(ChatQueueSubjectFilter.subjects(items) == ["Bio", "Business", "Business › Sales", "Business › Sales › Cold sales", "Business › Salesforce"])
        #expect(ChatQueueSubjectFilter.apply(items, subject: "Business").map(\.id) == ["1", "2", "3"])
        #expect(ChatQueueSubjectFilter.apply(items, subject: "Business › Sales").map(\.id) == ["1", "2"])
    }

    @Test("should ignore a chosen subject that no longer has cards")
    func vanished() {
        let items = [item("1", subject: "Net")]

        #expect(ChatQueueSubjectFilter.apply(items, subject: "Gone").map(\.id) == ["1"])
    }

    @MainActor
    @Test("should compose the subject filter with the waiting-over-14-days filter and sort")
    func composes() async {
        let items = [
            item("old-net", subject: "Net", chatAt: "2020-01-01T00:00:00.000Z"),
            item("old-bio", subject: "Bio", chatAt: "2020-01-02T00:00:00.000Z"),
            item("new-net", subject: "Net"),
        ]
        let actions = ChatQueueActions(
            list: { ChatQueueList(items: items, count: 3) },
            returnToInbox: { _ in },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { _ in }
        )
        let model = ChatQueueModel(actions: actions)

        await model.load()
        model.subject = "Net"
        model.sortOrder = .oldest

        #expect(model.sortedItems.map(\.id) == ["old-net", "new-net"])

        model.staleOnly = true

        #expect(model.sortedItems.map(\.id) == ["old-net"])

        model.sortOrder = .newest
        model.staleOnly = false

        #expect(model.sortedItems.map(\.id) == ["new-net", "old-net"])
        #expect(model.subjectNames == ["Bio", "Net"])
    }
}

@MainActor
@Suite("Chat queue subject filter with stale filter")
struct ChatQueueSubjectStaleTests {
    private func loaded(_ items: [ChatQueueItem], moved: @escaping @MainActor (String) -> Void = { _ in }) async -> ChatQueueModel {
        let actions = ChatQueueActions(
            list: { ChatQueueList(items: items, count: items.count) },
            returnToInbox: { id in moved(id) },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { _ in }
        )
        let model = ChatQueueModel(actions: actions)

        await model.load()

        return model
    }

    private let old = "2020-01-01T00:00:00.000Z"
    private let fresh = "2026-10-29T10:00:00.000Z"

    @Test("should offer only subjects that have stale cards while the stale filter is on")
    func optionsFollowStale() async {
        let model = await loaded([
            ChatQueueItem(id: "a", body: "a", subjectName: "Net", chatAt: old, turnsLeft: 8),
            ChatQueueItem(id: "b", body: "b", subjectName: "Bio", chatAt: fresh, turnsLeft: 8),
        ])

        #expect(model.subjectNames == ["Bio", "Net"])

        model.staleOnly = true

        #expect(model.subjectNames == ["Net"])
    }

    @Test("should drop a selected subject that has no stale cards when the stale filter turns on")
    func clearsOnStale() async {
        let model = await loaded([
            ChatQueueItem(id: "a", body: "a", subjectName: "Net", chatAt: old, turnsLeft: 8),
            ChatQueueItem(id: "b", body: "b", subjectName: "Bio", chatAt: fresh, turnsLeft: 8),
        ])

        model.subject = "Bio"
        model.staleOnly = true

        #expect(model.subject == nil)
        #expect(model.sortedItems.map(\.id) == ["a"])
    }

    @Test("should clear the selected subject when its last card leaves the list")
    func clearsWhenVanished() async {
        let model = await loaded([
            ChatQueueItem(id: "a", body: "a", subjectName: "Net", chatAt: fresh, turnsLeft: 8),
            ChatQueueItem(id: "b", body: "b", subjectName: "Bio", chatAt: fresh, turnsLeft: 8),
        ])

        model.subject = "Net"
        model.resolved("a")

        #expect(model.subject == nil)
        #expect(model.sortedItems.map(\.id) == ["b"])
    }

    @Test("should move exactly the visible cards of the chosen subject when moving all stale cards")
    func moveAllMatchesVisible() async {
        var moved: [String] = []
        let model = await loaded([
            ChatQueueItem(id: "n1", body: "n1", subjectName: "Net", chatAt: old, turnsLeft: 8),
            ChatQueueItem(id: "b1", body: "b1", subjectName: "Bio", chatAt: old, turnsLeft: 8),
            ChatQueueItem(id: "n2", body: "n2", subjectName: "Net", chatAt: fresh, turnsLeft: 8),
        ], moved: { moved.append($0) })

        model.staleOnly = true
        model.subject = "Net"

        #expect(model.sortedItems.map(\.id) == ["n1"])

        await model.moveAllVisibleToInbox()

        #expect(moved == ["n1"])
    }
}
