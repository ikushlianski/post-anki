import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("The owner can skip new cards and mark cards as already known")
    struct KnownAndRepeatOnlySmokeTests {
        private func cardsJSON(_ range: ClosedRange<Int>) -> String {
            let cards = range.map { index -> String in
                let id = String(format: "%02d", index)

                return """
                {"variantId":"v\(id)","knowledgeBitId":"k\(id)","kind":"wh_question","prompt":"Q\(id)","answer":"A\(id)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"new","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":3,"learning":0,"review":0},\
            "newRemainingToday":3,"nextDueAt":null}
            """
        }

        private static let knownResult = #"{"reviewId":"rev_9","knowledgeBitId":"k01","phase":"review","dueAt":"2027-05-01T09:00:00.000Z","intervalDays":200,"lapses":0,"leech":false,"suspended":false}"#

        private func routes() -> [String: FakeReply] {
            [
                "/knowledge-bits/review-cards": .json(200, cardsJSON(1...3)),
                "/knowledge-bits/reviews/known": .json(201, Self.knownResult),
                "/knowledge-bits/reviews/rev_9": .json(200, #"{"knowledgeBitId":"k01"}"#)
            ]
        }

        private func cardQueries() -> [String] {
            FakeServer.requests.filter { $0.path == "/knowledge-bits/review-cards" }.map { $0.query ?? "" }
        }

        @Test("should ask for repeat cards only when the toggle is on")
        func repeatOnlyQuery() async {
            let session = FakeServerSession(routes())
            defer { session.end() }

            await DueReviewModel(repeatOnly: true, retryDelay: nil).load()
            await DueReviewModel(repeatOnly: false, retryDelay: nil).load()

            let queries = cardQueries()

            #expect(queries.count == 2)
            #expect(queries[0].contains("newCards=exclude"))
            #expect(!queries[1].contains("newCards"))
        }

        @Test("should remember the toggle and reload the queue when it changes")
        func toggleReloads() async {
            let session = FakeServerSession(routes())
            defer {
                session.end()
                RepeatOnlyPreference.isOn = false
            }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()
            await model.setRepeatOnly(true)

            #expect(RepeatOnlyPreference.isOn)
            #expect(cardQueries().count == 2)
            #expect(cardQueries().last?.contains("newCards=exclude") == true)
        }

        @Test("should not filter a scoped review even when the preference is on")
        func scopedIgnoresToggle() {
            let model = DueReviewModel(scope: .subject(id: "s1", name: "Math"), repeatOnly: true, retryDelay: nil)

            #expect(!model.repeatOnly)
        }

        @Test("should send the known action and move on to the next card")
        func knownAdvances() async {
            let session = FakeServerSession(routes())
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()
            await model.markCurrentKnown()
            await model.settleBackgroundActions()

            let sent = FakeServer.requests.filter { $0.path == "/knowledge-bits/reviews/known" }

            #expect(sent.count == 1)
            #expect(sent.first?.bodyObject?["variantId"] as? String == "v01")
            #expect(model.current?.variantId == "v02")
            #expect(model.knownUndo?.reviewId == "rev_9")
            #expect(model.reviewedCount == 1)
        }

        @Test("should not count a card as reviewed when the server says it no longer exists")
        func knownGoneUncounts() async {
            var gone = routes()

            gone["/knowledge-bits/reviews/known"] = .json(404, #"{"error":"not_found"}"#)

            let session = FakeServerSession(gone)
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()
            await model.markCurrentKnown()
            await model.settleBackgroundActions()

            #expect(model.reviewedCount == 0)
            #expect(model.gradedNewCount == 0)
            #expect(model.current?.variantId == "v02")
            #expect(model.notice == "That card is no longer available")
        }

        @Test("should bring the card back when the known action is undone")
        func knownUndo() async {
            let session = FakeServerSession(routes())
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()
            await model.markCurrentKnown()
            await model.settleBackgroundActions()
            await model.undoKnown()
            await model.settleBackgroundActions()

            #expect(FakeServer.requests.contains { $0.method == "DELETE" && $0.path == "/knowledge-bits/reviews/rev_9" })
            #expect(model.current?.variantId == "v01")
            #expect(model.knownUndo == nil)
            #expect(model.reviewedCount == 0)
        }
    }
}
