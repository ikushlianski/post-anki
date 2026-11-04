import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review shows which card of the session the reader is on")
    struct DueReviewProgressSmokeTests {
        private static let twoCardsReply = """
        {"cards":[
        {"variantId":"v1","knowledgeBitId":"k1","kind":"wh_question","prompt":"P1","answer":"A1","background":null,"phase":"new","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":345600}},
        {"variantId":"v2","knowledgeBitId":"k2","kind":"wh_question","prompt":"P2","answer":"A2","background":null,"phase":"review","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":345600}}
        ],"counts":{"new":1,"learning":2,"review":1},"newRemainingToday":5,"nextDueAt":null}
        """

        private func makeModel(scope: DueReviewScope? = nil) -> (DueReviewModel, URL) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("progress-\(UUID().uuidString).json")

            return (DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), scope: scope), file)
        }

        @Test("should label the first card as 1 of the total the server reports")
        func firstCardShowsPositionOfTotal() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .fixture("review-cards")])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()

            #expect(model.progressLabel == "1 of 21")
        }

        @Test("should advance the position after a grade without changing the total")
        func gradingAdvancesPosition() async {
            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .fixture("review-cards"),
                "/knowledge-bits/reviews": .fixture("record-review")
            ])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()
            model.reveal()
            await model.grade(.good)

            #expect(model.progressLabel == "2 of 21")
        }

        @Test("should bring the position back to the card before the grade when that grade is undone")
        func undoRestoresPosition() async {
            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, Self.twoCardsReply),
                "/knowledge-bits/reviews": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()
            model.reveal()
            await model.grade(.good)

            #expect(model.progressLabel == "2 of 4")

            await model.undo()

            #expect(model.progressLabel == "1 of 4")
        }

        @Test("should keep the position unchanged after a bury because burying is not a review")
        func buryKeepsPosition() async {
            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, Self.twoCardsReply),
                "PATCH /knowledge-bits/k1/schedule": .json(200, #"{"knowledgeBitId":"k1","suspended":false,"buriedUntil":"2026-11-01T00:00:00.000Z","leech":false,"cardKey":null}"#)
            ])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()
            await model.buryCurrent()

            #expect(model.current?.knowledgeBitId == "k2")
            #expect(model.progressLabel == "1 of 4")
        }

        @Test("should omit the subject when the review is not limited to one subject")
        func unscopedReviewHasNoSubject() {
            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            #expect(model.subjectName == nil)
        }

        @Test("should show the subject name when the review is limited to one subject")
        func scopedReviewShowsSubject() {
            let (model, file) = makeModel(scope: .subject(id: "s1", name: "Swift"))
            defer { try? FileManager.default.removeItem(at: file) }

            #expect(model.subjectName == "Swift")
        }

        @Test("should hint keys 1 to 4 on Again, Hard, Good and Easy")
        func gradeButtonsCarryKeyHints() {
            let hints = ReviewGrade.allCases.map { DueReviewGradeButtons.keyHint(for: $0) }

            #expect(hints == ["1", "2", "3", "4"])
        }
    }
}
