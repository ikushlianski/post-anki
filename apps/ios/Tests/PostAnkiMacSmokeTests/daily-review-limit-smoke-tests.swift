import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("A daily review limit ends the session while review-ahead stays available")
    struct DailyReviewLimitSmokeTests {
        private static let reached = #"{"cards":[],"counts":{"new":0,"learning":0,"review":8},"newRemainingToday":0,"nextDueAt":"2026-11-05T09:00:00.000Z","limitReached":true,"reviewedToday":200,"limit":200}"#
        private static let ahead = #"{"cards":[{"variantId":"v01","knowledgeBitId":"k01","kind":"wh_question","prompt":"Q","answer":"A","background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"review","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}],"counts":{"new":0,"learning":0,"review":8},"newRemainingToday":0,"nextDueAt":null,"limitReached":true,"reviewedToday":200,"limit":200}"#

        @Test("should show the done-for-today state with the reviewed count when the limit is reached")
        func showsDoneState() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, Self.reached)])
            defer { session.end() }
            let model = DueReviewModel(retryDelay: nil)

            await model.load()

            #expect(model.state == .empty)
            #expect(model.dailyLimit?.message == "You reviewed 200 of 200 cards today.")
            #expect(DailyReviewLimit.aheadChoices == [1, 2, 3, 5])
        }

        @Test("should resume with cards when the owner picks a review-ahead window")
        func reviewAheadResumes() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, Self.reached)])
            defer { session.end() }
            let model = DueReviewModel(retryDelay: nil)

            await model.load()
            FakeServer.start(["/knowledge-bits/review-cards": .json(200, Self.ahead)])
            await model.reviewAhead(days: 3)

            let queries = FakeServer.requests.filter { $0.path == "/knowledge-bits/review-cards" }.map { $0.query ?? "" }

            #expect(model.state == .card)
            #expect(model.dailyLimit == nil)
            #expect(queries.last?.contains("aheadDays=3") == true)
        }

        @Test("should not show the done state when the server sends no limit fields")
        func oldServerNoDoneState() async {
            let json = Self.reached.replacingOccurrences(of: #","limitReached":true,"reviewedToday":200,"limit":200"#, with: "")
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, json)])
            defer { session.end() }
            let model = DueReviewModel(retryDelay: nil)

            await model.load()

            #expect(model.dailyLimit == nil)
        }
    }
}
