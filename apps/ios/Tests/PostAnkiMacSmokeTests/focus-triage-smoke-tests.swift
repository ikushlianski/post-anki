import Foundation
import PostAnkiAPI
import Testing

enum FocusTriageFixtures {
    static func bit(_ id: String, variants: Int = 1) -> String {
        let items = (0..<variants).map {
            #"{"id":"\#(id)_v\#($0)","kind":"basic","prompt":"p","answer":"a"}"#
        }

        return #"{"id":"\#(id)","body":"body \#(id)","background":null,"origin":"extracted","variants":[\#(items.joined(separator: ","))]}"#
    }

    static func source(_ id: String, subjectId: String? = nil, bits: [String]) -> String {
        let subject = subjectId.map { #""\#($0)""# } ?? "null"

        return #"{"knowledgeSourceId":"\#(id)","sourceText":"text","subjectName":null,"subjectId":\#(subject),"bits":[\#(bits.joined(separator: ","))]}"#
    }

    static func sources(_ items: [String]) throws -> [PendingReviewSource] {
        try JSONDecoder().decode([PendingReviewSource].self, from: Data("[\(items.joined(separator: ","))]".utf8))
    }

    static func list(_ items: [String]) -> String { "[\(items.joined(separator: ","))]" }
}

extension SmokeTests {
    @MainActor
    @Suite("Focus triage queue, decision log and rules")
    struct FocusTriageRulesSmokeTests {
        @Test("should show the first card with questions and count cards still being written as waiting")
        func queueSkipsWaitingCards() throws {
            let sources = try FocusTriageFixtures.sources([
                FocusTriageFixtures.source("s1", bits: [FocusTriageFixtures.bit("a", variants: 0), FocusTriageFixtures.bit("b", variants: 2), FocusTriageFixtures.bit("c")])
            ])
            let queue = FocusTriageQueue.build(sources: sources, pinnedBitId: nil)

            #expect(queue.current?.id == "b")
            #expect(queue.currentSource?.id == "s1")
            #expect(queue.readyCount == 2)
            #expect(queue.waitingCount == 1)
        }

        @Test("should keep the pinned card on screen when a newly written card lands ahead of it")
        func queueKeepsPinnedCard() throws {
            let sources = try FocusTriageFixtures.sources([
                FocusTriageFixtures.source("s1", bits: [FocusTriageFixtures.bit("new"), FocusTriageFixtures.bit("b")])
            ])

            #expect(FocusTriageQueue.build(sources: sources, pinnedBitId: "b").current?.id == "b")
            #expect(FocusTriageQueue.build(sources: sources, pinnedBitId: "gone").current?.id == "new")
        }

        @Test("should have no current card when every card is still being written")
        func queueEmptyWhenAllWaiting() throws {
            let sources = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [FocusTriageFixtures.bit("a", variants: 0)])])
            let queue = FocusTriageQueue.build(sources: sources, pinnedBitId: nil)

            #expect(queue.current == nil)
            #expect(queue.waitingCount == 1)
        }

        @Test("should undo the newest decision first and leave out decisions made before the session began")
        func logOrdersAndExcludesBaseline() {
            var log = FocusTriageDecisionLog()

            log.record(FocusTriageDecisionEntry(bitId: "old", verdict: .approved, removed: nil))
            log.markBaseline()
            log.record(FocusTriageDecisionEntry(bitId: "a", verdict: .approved, removed: nil))
            log.record(FocusTriageDecisionEntry(bitId: "b", verdict: .rejected, removed: nil))

            #expect(log.lastDecided?.bitId == "b")
            #expect(log.sessionDecisions().map(\.bitId) == ["a", "b"])
            #expect(log.acceptedCount() == 1)
            #expect(log.rejectedCount() == 1)

            log.remove(bitId: "b")

            #expect(log.lastDecided?.bitId == "a")
        }

        @Test("should send at most 500 decisions and let a fresh decision replace an earlier one on the same card")
        func logCapsAndDeduplicates() {
            var log = FocusTriageDecisionLog()
            let earlier = (0..<499).map { TriageDecision(bitId: "e\($0)", verdict: .approved) }

            log.record(FocusTriageDecisionEntry(bitId: "e0", verdict: .rejected, removed: nil))
            log.record(FocusTriageDecisionEntry(bitId: "x", verdict: .approved, removed: nil))
            log.record(FocusTriageDecisionEntry(bitId: "y", verdict: .approved, removed: nil))

            let sent = log.cappedDecisions(earlier: earlier)

            #expect(sent.count == 500)
            #expect(sent.last?.bitId == "y")
            #expect(sent.filter { $0.bitId == "e0" }.map(\.verdict) == [.rejected])
            #expect(log.sessionDecisions(earlier: earlier).count == 501)
        }

        @Test("should trim a note to 500 characters and the feedback to 8,000, and send nothing when empty")
        func trimsText() {
            #expect(FocusTriageNote.trimmed("  too vague \n") == "too vague")
            #expect(FocusTriageNote.trimmed(" \n ") == nil)
            #expect(FocusTriageNote.trimmed(String(repeating: "a", count: 600))?.count == 500)
            #expect(FocusTriageFeedback.trimmed(String(repeating: "b", count: 9_000))?.count == 8_000)
            #expect(FocusTriageFeedback.trimmed("") == nil)
        }

        @Test("should start a session on one subject only when every source with cards shares it")
        func singleSubject() throws {
            let same = try FocusTriageFixtures.sources([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a")]),
                FocusTriageFixtures.source("s2", subjectId: "sub1", bits: [FocusTriageFixtures.bit("b")]),
                FocusTriageFixtures.source("s3", subjectId: "sub2", bits: [])
            ])
            let mixed = try FocusTriageFixtures.sources([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a")]),
                FocusTriageFixtures.source("s2", subjectId: "sub2", bits: [FocusTriageFixtures.bit("b")])
            ])
            let none = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [FocusTriageFixtures.bit("a")])])

            #expect(FocusTriageSubject.single(same) == "sub1")
            #expect(FocusTriageSubject.single(mixed) == nil)
            #expect(FocusTriageSubject.single(none) == nil)
        }

        @Test("should poll every 8 seconds only while cards are waiting and stop after 40 tries")
        func pollPlan() {
            #expect(FocusTriagePollPlan.interval == .seconds(8))
            #expect(FocusTriagePollPlan.shouldPoll(waiting: 2, attempts: 0))
            #expect(FocusTriagePollPlan.shouldPoll(waiting: 1, attempts: 39))
            #expect(!FocusTriagePollPlan.shouldPoll(waiting: 1, attempts: 40))
            #expect(!FocusTriagePollPlan.shouldPoll(waiting: 0, attempts: 3))
        }
    }
}
