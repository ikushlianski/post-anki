import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Rejected note, list truncation and insight statistics")
struct AnalyticsInsightsTests {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    @Test("should decode the note typed when rejecting and hide blank notes")
    func note() throws {
        let page = try decode(RejectedCardsPage.self, """
        {"items":[{"knowledgeBitId":"a","body":"b","reasonCode":"other","decidedAt":"2026-01-01","note":"  too vague  "},
        {"knowledgeBitId":"b","body":"b","reasonCode":"other","decidedAt":"2026-01-01","note":"   "},
        {"knowledgeBitId":"c","body":"b","reasonCode":"other","decidedAt":"2026-01-01","note":null},
        {"knowledgeBitId":"d","body":"b","reasonCode":"other","decidedAt":"2026-01-01"}],"hasMore":false}
        """)

        #expect(page.items.map(\.noteText) == ["too vague", nil, nil, nil])
    }

    @Test("should show the first N of TOTAL notice only when more cards exist")
    func truncation() throws {
        let chat = try decode(ChatQueueList.self, #"{"items":[],"count":0,"hasMore":true,"total":250}"#)
        let plain = try decode(ChatQueueList.self, #"{"items":[],"count":0}"#)
        let inbox = try decode(InboxKnowledgeBitList.self, #"{"items":[],"count":230,"hasMore":true,"total":230}"#)
        let full = try decode(InboxKnowledgeBitList.self, #"{"items":[],"count":2,"hasMore":false,"total":2}"#)

        #expect(chat.truncation?.message == "Showing the first 0 of 250 cards")
        #expect(plain.truncation == nil)
        #expect(inbox.truncation?.total == 230)
        #expect(full.truncation == nil)
        #expect(ListTruncation.make(shown: 200, hasMore: true, total: nil) == nil)
        #expect(ListTruncation.make(shown: 200, hasMore: true, total: 250)?.message == "Showing the first 200 of 250 cards")
    }

    @Test("should decode reject reasons with labels and percentages")
    func rejectReasons() throws {
        let stats = try decode(RejectReasonsStatistics.self, #"{"total":4,"reasons":[{"reasonCode":"wrong_language","count":3,"share":0.75},{"reasonCode":"zzz","count":1,"share":0.25}],"weekly":[]}"#)

        #expect(stats.total == 4)
        #expect(stats.reasons[0].summary == "Wrong language: 3 (75%)")
        #expect(stats.reasons[1].label == "Other reason")
    }

    @Test("should summarise the latest week that had notes")
    func nothingExtracted() throws {
        let stats = try decode(NothingExtractedStatistics.self, """
        {"weekly":[{"weekStart":"2026-01-05","processed":4,"nothingExtracted":1,"rate":0.25},{"weekStart":"2026-01-12","processed":0,"nothingExtracted":0,"rate":0}]}
        """)
        let empty = try decode(NothingExtractedStatistics.self, #"{"weekly":[{"weekStart":"2026-01-05","processed":0,"nothingExtracted":0,"rate":0}]}"#)

        #expect(stats.summary == "Latest week with notes: 25% gave no cards (1 of 4)")
        #expect(empty.summary == nil)
    }

    @Test("should build outcome rows and an empty message for Chat outcomes")
    func outcomes() throws {
        let stats = try decode(ChatQueueOutcomesStatistics.self, #"{"windowDays":30,"total":4,"accepted":2,"rejected":1,"waiting":1,"snoozed":0}"#)
        let none = try decode(ChatQueueOutcomesStatistics.self, #"{"windowDays":30,"total":0,"accepted":0,"rejected":0,"waiting":0,"snoozed":0}"#)

        #expect(stats.rows.map(\.summary) == ["Accepted: 2 (50%)", "Rejected: 1 (25%)", "Still waiting: 1 (25%)", "Snoozed: 0 (0%)"])
        #expect(stats.totalText == "4 cards sent to Chat in the last 30 days")
        #expect(none.rows.isEmpty)
        #expect(none.emptyText == "No cards were sent to Chat in the last 30 days")
    }

    @Test("should expose the value only when ready")
    func state() {
        #expect(InsightState<Int>.ready(3).value == 3)
        #expect(InsightState<Int>.loading.value == nil)
        #expect(InsightState<Int>.failed("x").value == nil)
    }
}

@MainActor
@Suite("Truncation notice and bulk move announcements")
struct TruncationTrackerTests {
    @Test("should lower the total when a card leaves and drop the notice once everything is shown")
    func tracker() {
        var tracker = TruncationTracker(ListTruncation(shown: 200, total: 202))

        #expect(tracker.truncation(shown: 200)?.message == "Showing the first 200 of 202 cards")

        tracker.removedOne()

        #expect(tracker.truncation(shown: 199)?.message == "Showing the first 199 of 201 cards")

        tracker.removedOne()
        tracker.removedOne()

        #expect(tracker.truncation(shown: 199) == nil)
        #expect(TruncationTracker().truncation(shown: 5) == nil)
    }

    @Test("should update the Chat notice after a card is resolved")
    func chatModelNotice() async {
        let items = (0..<3).map { ChatQueueItem(id: "c\($0)", body: "b", chatAt: "2026-01-01T00:00:00.000Z", turnsLeft: 8) }
        let model = ChatQueueModel(actions: ChatQueueActions(
            list: { ChatQueueList(items: items, count: 3, hasMore: true, total: 4) },
            returnToInbox: { _ in },
            snooze: { _, _ in },
            unsnooze: { _ in },
            setCount: { _ in }
        ))

        await model.load()

        #expect(model.truncation?.message == "Showing the first 3 of 4 cards")

        model.resolved("c0")

        #expect(model.truncation?.message == "Showing the first 2 of 3 cards")

        model.resolved("c1")

        #expect(model.truncation?.message == "Showing the first 1 of 2 cards")

        model.resolved("c2")

        #expect(model.truncation?.total == 1)
    }

    @Test("should announce how many cards moved and report the count from move all")
    func moveAll() async {
        #expect(TriageAnnouncement.movedAllToInbox(count: 1).message == "1 card moved to Inbox")
        #expect(TriageAnnouncement.movedAllToInbox(count: 4).message == "4 cards moved to Inbox")
        #expect(WeeklyDigestMessages.loadFailure == "Couldn't load the weekly digest.")
    }
}
