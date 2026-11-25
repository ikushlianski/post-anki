import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review actions other than grading show the next card at once and save in the background")
    struct ReviewBackgroundActionsSmokeTests {
        private static let schedulePath = "PATCH /knowledge-bits/k01/schedule"
        private static let scheduleReply = #"{"knowledgeBitId":"k01","suspended":true,"buriedUntil":null,"leech":false,"cardKey":null}"#
        private static let knownReply = #"{"reviewId":"rev_9","knowledgeBitId":"k01","phase":"review","dueAt":"2027-05-01T09:00:00.000Z","intervalDays":200,"lapses":0,"leech":false,"suspended":false}"#
        private static let movedReply = #"{"moved":["k01"],"skipped":[]}"#

        private func cardsJSON() -> String {
            let cards = (1...3).map { index in
                """
                {"variantId":"v0\(index)","knowledgeBitId":"k0\(index)","kind":"wh_question","prompt":"Q\(index)","answer":"A\(index)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"new","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":3,"learning":0,"review":0},\
            "newRemainingToday":3,"nextDueAt":null}
            """
        }

        private func make(_ extra: [String: FakeReply]) async -> (DueReviewModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/review-cards": .json(200, cardsJSON())]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int = 1) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        private func writes(_ path: String) -> [RecordedRequest] {
            FakeServer.requests.filter { $0.path == path && $0.method != "GET" }
        }

        @Test("should show the next card before the bury is confirmed and not send it twice")
        func buryAdvancesAtOnce() async throws {
            let (model, session) = await make([Self.schedulePath: .held(200, Self.scheduleReply)])
            defer { session.end() }

            await model.buryCurrent()

            try await waitForHeld()

            #expect(model.current?.variantId == "v02")
            #expect(!model.isGrading)

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v02")
            #expect(writes("/knowledge-bits/k01/schedule").count == 1)
            #expect(model.notice == "Card buried until tomorrow")
        }

        @Test("should put the buried card back in the queue with a plain message when saving fails")
        func buryRollsBack() async {
            let (model, session) = await make([Self.schedulePath: .json(500, "{}")])
            defer { session.end() }

            await model.buryCurrent()
            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v02")
            #expect(model.queue.map(\.variantId) == ["v01", "v03"])
            #expect(model.notice?.contains("update this card") == true)
        }

        @Test("should show the next card before the suspend is confirmed and offer undo at once")
        func suspendAdvancesAtOnce() async throws {
            let (model, session) = await make([Self.schedulePath: .held(200, Self.scheduleReply)])
            defer { session.end() }

            await model.suspendCurrent(offersUndo: true)

            try await waitForHeld()

            #expect(model.current?.variantId == "v02")
            #expect(model.suspendedUndo?.variantId == "v01")

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(model.suspendedUndo?.variantId == "v01")
        }

        @Test("should put the suspended card back in the queue and drop the undo when saving fails")
        func suspendRollsBack() async {
            let (model, session) = await make([Self.schedulePath: .json(500, "{}")])
            defer { session.end() }

            model.reveal()
            await model.suspendCurrent(offersUndo: true)
            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v02")
            #expect(model.queue.first?.variantId == "v01")
            #expect(model.suspendedUndo == nil)
        }

        @Test("should show the next card and count it before the known mark is confirmed, sent once")
        func knownAdvancesAtOnce() async throws {
            let (model, session) = await make(["POST /knowledge-bits/reviews/known": .held(200, Self.knownReply)])
            defer { session.end() }

            await model.markCurrentKnown()

            try await waitForHeld()

            #expect(model.current?.variantId == "v02")
            #expect(model.reviewedCount == 1)
            #expect(model.knownUndo?.reviewId == nil)

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(writes("/knowledge-bits/reviews/known").count == 1)
            #expect(model.knownUndo?.reviewId == "rev_9")
        }

        @Test("should put the card back and undo the count when marking known fails")
        func knownRollsBack() async {
            let (model, session) = await make(["POST /knowledge-bits/reviews/known": .json(500, "{}")])
            defer { session.end() }

            await model.markCurrentKnown()
            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v02")
            #expect(model.queue.first?.variantId == "v01")
            #expect(model.reviewedCount == 0)
            #expect(model.gradedNewCount == 0)
            #expect(!model.settledVariantIds.contains("v01"))
            #expect(model.knownUndo == nil)
            #expect(model.notice?.contains("mark this card as known") == true)
        }

        @Test("should show the next card before the move is confirmed, sent once")
        func moveAdvancesAtOnce() async throws {
            let (model, session) = await make(["POST /knowledge-bits/moves": .held(200, Self.movedReply)])
            defer { session.end() }

            model.presentMovePicker()

            let started = await model.moveCurrent(toSubject: "s1", label: "English")

            try await waitForHeld()

            #expect(started)
            #expect(model.current?.variantId == "v02")
            #expect(model.movePickerCard == nil)
            #expect(!model.isGrading)

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(writes("/knowledge-bits/moves").count == 1)
            #expect(model.notice == "Moved to English")
        }

        @Test("should put the card back and say why when the move fails after the learner moved on")
        func moveRollsBack() async {
            let (model, session) = await make(["POST /knowledge-bits/moves": .json(500, "{}")])
            defer { session.end() }

            model.presentMovePicker()

            let started = await model.moveCurrent(toSubject: "s1", label: "English")
            await model.settleBackgroundActions()

            #expect(started)
            #expect(model.current?.variantId == "v02")
            #expect(model.queue.first?.variantId == "v01")
            #expect(model.notice?.contains("move this card") == true)
        }
    }
}
