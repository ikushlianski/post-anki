import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Learn ahead lets the owner review cards that are not due yet")
    struct LearnAheadSmokeTests {
        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("ahead-\(UUID().uuidString).json")
        }

        private func cardsJSON(_ range: ClosedRange<Int>) -> String {
            let cards = range.map { index -> String in
                let id = String(format: "%02d", index)

                return """
                {"variantId":"v\(id)","knowledgeBitId":"k\(id)","kind":"wh_question","prompt":"Q\(id)","answer":"A\(id)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"review","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":0,"learning":0,"review":60},\
            "newRemainingToday":0,"nextDueAt":null}
            """
        }

        private static let gradeResult = #"{"reviewId":"rev_1","knowledgeBitId":"k01","phase":"learning","dueAt":"2026-10-28T09:00:00.000Z","intervalDays":0,"lapses":0,"leech":false,"suspended":false}"#

        private func routes(_ cards: ClosedRange<Int>) -> [String: FakeReply] {
            ["/knowledge-bits/review-cards": .json(200, cardsJSON(cards)), "/knowledge-bits/reviews": .held(200, Self.gradeResult)]
        }

        private func cardQueries() -> [String] {
            FakeServer.requests.filter { $0.path == "/knowledge-bits/review-cards" }.map { $0.query ?? "" }
        }

        @Test("should stop a scoped review at the empty state once nothing is due and a next due time exists")
        func scopedStopsWhenNothingDue() async {
            let json = cardsJSON(1...2)
                .replacingOccurrences(of: #""nextDueAt":null"#, with: #""nextDueAt":"2026-11-05T09:00:00.000Z""#)
                .replacingOccurrences(of: #""review":60"#, with: #""review":0"#)
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, json)])
            defer { session.end() }
            let model = DueReviewModel(scope: .subject(id: "s1", name: "Math"), retryDelay: nil)

            model.reviewedCount = 2
            await model.load()

            #expect(model.state == .empty)
            #expect(model.nextDueAt != nil)
        }

        @Test("should offer off, 1, 2, 3 and 7 days in that order")
        func options() {
            #expect(LearnAheadOption.allCases.map(\.days) == [0, 1, 2, 3, 7])
            #expect(LearnAheadOption.allCases.map(\.title) == ["Off", "1 day", "2 days", "3 days", "7 days"])
        }

        @Test("should only label the review screen when learning ahead")
        func label() {
            #expect(DueReviewModel(retryDelay: nil).aheadLabel == nil)
            #expect(DueReviewModel(aheadDays: 1, retryDelay: nil).aheadLabel == "Learning ahead 1 day")
            #expect(DueReviewModel(aheadDays: 3, retryDelay: nil).aheadLabel == "Learning ahead 3 days")
            #expect(DueReviewModel(aheadDays: 99, retryDelay: nil).aheadDays == 30)
        }

        @Test("should not ask the server to look ahead by default")
        func defaultOff() async {
            let session = FakeServerSession(routes(1...5))
            defer { session.end() }
            let model = DueReviewModel(retryDelay: nil)

            await model.load()

            #expect(cardQueries().allSatisfy { !$0.contains("aheadDays") })
        }

        @Test("should send the chosen days on every load, including a pull to refresh")
        func loadSendsAhead() async {
            let session = FakeServerSession(routes(1...5))
            defer { session.end() }
            let model = DueReviewModel(aheadDays: 3, retryDelay: nil)

            await model.load()
            await model.load()

            #expect(cardQueries().count == 2)
            #expect(cardQueries().allSatisfy { $0.contains("aheadDays=3") })
        }

        @Test("should keep learning ahead when the card window tops up")
        func topUpSendsAhead() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(1...20))
            defer { session.end() }
            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), aheadDays: 7, retryDelay: nil)

            await model.load()
            FakeServer.start(routes(1...50))

            for _ in 0..<12 {
                model.reveal()
                await model.grade(.good)
            }

            await model.topUpTask?.value

            #expect(cardQueries().count == 1)
            #expect(cardQueries().allSatisfy { $0.contains("aheadDays=7") })

            await model.stopBackgroundWork()
        }
    }
}
