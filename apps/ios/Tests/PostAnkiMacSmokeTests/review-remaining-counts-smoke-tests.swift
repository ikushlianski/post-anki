import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review shows how many New, Learning and Due cards remain")
    struct ReviewRemainingCountsSmokeTests {
        private static let newCardsReply = """
        {"cards":[
        {"variantId":"v1","knowledgeBitId":"k1","kind":"wh_question","prompt":"P1","answer":"A1","background":null,"phase":"new","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":345600}},
        {"variantId":"v2","knowledgeBitId":"k2","kind":"wh_question","prompt":"P2","answer":"A2","background":null,"phase":"review","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":345600}}
        ],"counts":{"new":1,"learning":2,"review":1},"newRemainingToday":5,"nextDueAt":null}
        """

        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("counts-\(UUID().uuidString).json")
        }

        private func makeModel() -> (DueReviewModel, URL) {
            let file = tempFile()

            return (DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file)), file)
        }

        @Test("should lower New for a graded new card and Due for any other, never below zero")
        func deriverLowersByPhase() {
            let server = ReviewRemainingCounts(new: 1, learning: 2, review: 1)
            let lowered = server.lowered(gradedNew: 3, gradedOther: 2)

            #expect(lowered == ReviewRemainingCounts(new: 0, learning: 2, review: 0))
            #expect(server.lowered(gradedNew: 0, gradedOther: 0) == server)
        }

        @Test("should show the server numbers right after the cards load")
        func loadShowsServerNumbers() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .fixture("review-cards")])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()

            #expect(model.remainingCounts == ReviewRemainingCounts(new: 7, learning: 2, review: 12))
        }

        @Test("should lower Due when a learning card is graded and keep New and Learning as served")
        func gradingNonNewLowersDue() async {
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

            #expect(model.remainingCounts == ReviewRemainingCounts(new: 7, learning: 2, review: 11))
        }

        @Test("should lower New when a new card is graded and raise it back on undo")
        func gradingNewLowersNewAndUndoRestores() async {
            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, Self.newCardsReply),
                "/knowledge-bits/reviews": .fixture("record-review"),
                "/knowledge-bits/reviews/rev_01": .fixture("undo-review")
            ])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()
            model.reveal()
            await model.grade(.good)

            #expect(model.remainingCounts == ReviewRemainingCounts(new: 0, learning: 2, review: 1))

            await model.undo()

            #expect(model.remainingCounts == ReviewRemainingCounts(new: 1, learning: 2, review: 1))
        }

        @Test("should lower the count for a grade saved offline and raise it when that grade is undone")
        func offlineGradeLowersAndUndoRestores() async {
            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .fixture("review-cards"),
                "/knowledge-bits/reviews": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()
            model.reveal()
            await model.grade(.good)

            #expect(model.remainingCounts?.review == 11)

            await model.undo()

            #expect(model.remainingCounts == ReviewRemainingCounts(new: 7, learning: 2, review: 12))
        }

        @Test("should go back to the server numbers when the cards are reloaded")
        func reloadResetsToServerNumbers() async {
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
            await model.load()

            #expect(model.remainingCounts == ReviewRemainingCounts(new: 7, learning: 2, review: 12))
        }
    }
}
