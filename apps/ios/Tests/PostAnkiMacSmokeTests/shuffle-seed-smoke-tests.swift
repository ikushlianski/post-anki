import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Shuffling today's cards keeps one seed for the whole session")
    struct ShuffleSeedSmokeTests {
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

        private func cardQueries() -> [String] {
            FakeServer.requests.filter { $0.path == "/knowledge-bits/review-cards" }.map { $0.query ?? "" }
        }

        @Test("should ask for the same shuffle seed when the queue tops up")
        func topUpReusesSeed() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, cardsJSON(1...20))])
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.setShuffle(true)

            model.queue = Array(model.queue.prefix(3))
            model.topUpIfNeeded()
            await model.topUpTask?.value

            let queries = cardQueries()

            #expect(queries.count == 2)
            #expect(model.shuffleSeed != nil)
            #expect(queries.allSatisfy { $0.contains("shuffleSeed=\(model.shuffleSeed ?? "-")") })
        }
    }
}
