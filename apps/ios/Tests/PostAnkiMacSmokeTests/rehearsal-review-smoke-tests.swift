import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review shows another wording of the same idea without changing the schedule")
    struct RehearsalReviewSmokeTests {
        private static func card(_ variant: String, bit: String) -> String {
            """
            {"variantId":"\(variant)","knowledgeBitId":"\(bit)","kind":"wh_question","cardKey":"","prompt":"Q\(variant)","answer":"A\(variant)",
            "background":null,"phase":"review","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
            """
        }

        private static var queueJSON: String {
            let cards = [card("a1", bit: "kb_1"), card("b1", bit: "kb_2"), card("c1", bit: "kb_3")].joined(separator: ",")

            return #"{"cards":[\#(cards)],"counts":{"new":0,"learning":0,"review":3},"newRemainingToday":0,"nextDueAt":null}"#
        }

        private static func gradeResult(followUp: Bool) -> String {
            let extra = followUp ? #","followUp":\#(card("a2", bit: "kb_1"))"# : ""

            return #"{"reviewId":"rev_1","knowledgeBitId":"kb_1","phase":"review","dueAt":"2026-11-10T09:00:00.000Z","intervalDays":6,"lapses":0,"leech":false,"suspended":false\#(extra)}"#
        }

        private func tempQueue() -> (PendingGradeQueue, URL) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("rehearsal-\(UUID().uuidString).json")

            return (PendingGradeQueue(fileURL: file), file)
        }

        private func gradedModel(_ grade: ReviewGrade, followUp: Bool = true) async -> DueReviewModel {
            let (queue, file) = tempQueue()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, Self.queueJSON),
                "/knowledge-bits/reviews": .json(201, Self.gradeResult(followUp: followUp))
            ])
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: queue, retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(grade)
            await model.sendTask?.value

            return model
        }

        @Test("should queue the other wording right behind the card on screen after a passing grade")
        func followUpComesNext() async {
            let model = await gradedModel(.good)

            #expect(model.current?.variantId == "b1")
            #expect(model.queue.map(\.variantId) == ["a2", "c1"])
            #expect(model.queue.first?.isRehearsal == true)
            #expect(model.queue.dropFirst().allSatisfy { !$0.isRehearsal })
        }

        @Test("should not offer another wording after a failed grade")
        func noFollowUpAfterAgain() async {
            let model = await gradedModel(.again)

            #expect(model.queue.map(\.variantId) == ["c1"])
        }

        @Test("should behave as before when the server returns no other wording")
        func singleWordingUnchanged() async {
            let model = await gradedModel(.good, followUp: false)

            #expect(model.queue.map(\.variantId) == ["c1"])
        }

        @Test("should skip the other wording when the grade was saved offline and sent later")
        func offlineSkipsFollowUp() async {
            let (queue, file) = tempQueue()
            defer { try? FileManager.default.removeItem(at: file) }

            let offline = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, Self.queueJSON),
                "/knowledge-bits/reviews": .failure(.notConnectedToInternet)
            ])
            let model = DueReviewModel(gradeQueue: queue, retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(.good)
            await model.sendTask?.value
            offline.end()

            let online = FakeServerSession(["/knowledge-bits/reviews": .json(201, Self.gradeResult(followUp: true))])
            defer { online.end() }

            model.sendPendingInBackground()
            await model.sendTask?.value

            #expect(model.queue.map(\.variantId) == ["c1"])
        }

        @Test("should send a rehearsal answer flagged, with no points, progress or undo")
        func rehearsalGradeIsLight() async {
            let (queue, file) = tempQueue()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, Self.queueJSON),
                "/knowledge-bits/reviews": .json(201, Self.gradeResult(followUp: true))
            ])
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: queue, retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(.good)
            await model.sendTask?.value
            await model.showNext()

            #expect(model.current?.isRehearsal == true)

            let reviewed = model.reviewedCount
            let others = model.gradedOtherCount

            model.reveal()
            await model.grade(.again)
            await model.sendTask?.value

            let body = FakeServer.writes.last?.bodyObject

            #expect(body?["rehearsal"] as? Bool == true)
            #expect(body?["variantId"] as? String == "a2")
            #expect(body?["grade"] as? String == "again")
            #expect(model.reviewedCount == reviewed)
            #expect(model.gradedOtherCount == others)
            #expect(model.lastGraded == nil)
            #expect(model.queue.allSatisfy { !$0.isRehearsal })
        }

        @Test("should keep a queued rehearsal card through refills and same-idea cleanup")
        func rehearsalSurvivesWindowMerge() {
            let preview = IntervalPreview.testValue
            let rehearsal = ReviewCard(variantId: "a2", knowledgeBitId: "kb_1", kind: "wh_question", prompt: "p", answer: "a", background: nil, phase: "review", leech: false, intervalPreview: preview).asRehearsal
            let sibling = ReviewCard(variantId: "a3", knowledgeBitId: "kb_1", kind: "wh_question", prompt: "p", answer: "a", background: nil, phase: "review", leech: false, intervalPreview: preview)
            let other = ReviewCard(variantId: "b1", knowledgeBitId: "kb_2", kind: "wh_question", prompt: "p", answer: "a", background: nil, phase: "review", leech: false, intervalPreview: preview)

            let merged = ReviewCardWindow.merge(
                held: [rehearsal],
                shown: nil,
                incoming: [sibling, other],
                isComplete: true,
                buriesSiblings: true,
                isBlocked: { _ in false }
            )

            #expect(merged.map(\.variantId) == ["a2", "b1"])
        }
    }
}

private extension IntervalPreview {
    static var testValue: IntervalPreview {
        try! JSONDecoder().decode(IntervalPreview.self, from: Data(#"{"again":1,"hard":1,"good":1,"easy":1}"#.utf8))
    }
}
