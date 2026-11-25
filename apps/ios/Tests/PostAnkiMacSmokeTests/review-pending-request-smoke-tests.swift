import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("The learner keeps answering cards while an earlier action is still being saved")
    struct ReviewPendingRequestSmokeTests {
        private static let schedule = "PATCH /knowledge-bits/k01/schedule"
        private static let known = "POST /knowledge-bits/reviews/known"
        private static let moves = "POST /knowledge-bits/moves"
        private static let scheduleReply = #"{"knowledgeBitId":"k01","suspended":true,"buriedUntil":null,"leech":false,"cardKey":null}"#
        private static let movedReply = #"{"moved":["k01"],"skipped":[]}"#

        private static func knownReply(_ id: String) -> String {
            #"{"reviewId":"\#(id)","knowledgeBitId":"k01","phase":"review","dueAt":"2027-05-01T09:00:00.000Z","intervalDays":200,"lapses":0,"leech":false,"suspended":false}"#
        }

        private func cardsJSON() -> String {
            let cards = (1...4).map { index in
                """
                {"variantId":"v0\(index)","knowledgeBitId":"k0\(index)","kind":"wh_question","prompt":"Q\(index)","answer":"A\(index)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"new","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":4,"learning":0,"review":0},\
            "newRemainingToday":4,"nextDueAt":null}
            """
        }

        private func make(_ extra: [String: FakeReply]) async -> (DueReviewModel, FakeServerSession) {
            var routes: [String: FakeReply] = [
                "/knowledge-bits/review-cards": .json(200, cardsJSON()),
                "POST /knowledge-bits/reviews/known": .json(201, Self.knownReply("rev_2")),
                "DELETE /knowledge-bits/reviews/rev_1": .json(200, #"{"knowledgeBitId":"k01"}"#)
            ]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int = 1) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        private func writes(_ path: String, method: String? = nil) -> [RecordedRequest] {
            FakeServer.requests.filter { $0.path == path && $0.method != "GET" && (method == nil || $0.method == method) }
        }

        @Test("should let the learner mark the next card known while the first known mark is still saving")
        func knownDoesNotBlockNextKnown() async throws {
            let (model, session) = await make([Self.known: .held(200, Self.knownReply("rev_1"))])
            defer { session.end() }

            await model.markCurrentKnown()

            #expect(!model.isGrading)

            await model.markCurrentKnown()

            try await waitForHeld(2)

            #expect(model.current?.variantId == "v03")
            #expect(model.reviewedCount == 2)
            #expect(model.handleConfirmKey())
            #expect(model.isRevealed)

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(writes("/knowledge-bits/reviews/known").count == 2)
        }

        @Test("should keep the shown card and put the failed one back when a known mark fails after moving on")
        func knownFailureAfterMovingOn() async throws {
            let (model, session) = await make([Self.known: .held(500, "{}")])
            defer { session.end() }

            await model.markCurrentKnown()
            try await waitForHeld()
            model.reveal()
            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v02")
            #expect(model.isRevealed)
            #expect(model.queue.map(\.variantId) == ["v01", "v03", "v04"])
            #expect(model.reviewedCount == 0)
            #expect(model.knownUndo == nil)
            #expect(model.notice?.contains("mark this card as known") == true)
        }

        @Test("should send a known mark once and not retry it on its own after a network failure")
        func knownIsNeverRetried() async {
            let (model, session) = await make([Self.known: .failure(.notConnectedToInternet)])
            defer { session.end() }

            await model.markCurrentKnown()
            await model.settleBackgroundActions()
            await model.markCurrentKnown()
            await model.settleBackgroundActions()

            #expect(writes("/knowledge-bits/reviews/known").count == 2)
            #expect(model.queue.first?.variantId == "v02")
        }

        @Test("should wait for the known mark to be saved before sending its undo, then send it exactly once")
        func undoKnownWaitsForReviewId() async throws {
            let (model, session) = await make([Self.known: .held(200, Self.knownReply("rev_1"))])
            defer { session.end() }

            await model.markCurrentKnown()
            try await waitForHeld()
            await model.undoKnown()

            #expect(model.current?.variantId == "v01")
            #expect(model.reviewedCount == 0)
            #expect(writes("/knowledge-bits/reviews/rev_1").isEmpty)

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(writes("/knowledge-bits/reviews/rev_1", method: "DELETE").count == 1)
            #expect(model.current?.variantId == "v01")
            #expect(model.reviewedCount == 0)
        }

        @Test("should send no undo at all when the known mark it was waiting for failed")
        func undoKnownAfterFailedKnownSendsNothing() async throws {
            let (model, session) = await make([Self.known: .held(500, "{}")])
            defer { session.end() }

            await model.markCurrentKnown()
            try await waitForHeld()
            await model.undoKnown()
            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(writes("/knowledge-bits/reviews/known").count == 1)
            #expect(FakeServer.requests.filter { $0.method == "DELETE" }.isEmpty)
            #expect(model.current?.variantId == "v01")
            #expect(model.reviewedCount == 0)
        }

        @Test("should keep the card known and say so when the undo of a known mark is refused")
        func undoKnownRefused() async {
            let (model, session) = await make([
                Self.known: .json(201, Self.knownReply("rev_1")),
                "DELETE /knowledge-bits/reviews/rev_1": .json(409, "{}")
            ])
            defer { session.end() }

            await model.markCurrentKnown()
            await model.settleBackgroundActions()
            await model.undoKnown()

            #expect(model.current?.variantId == "v01")

            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v02")
            #expect(model.reviewedCount == 1)
            #expect(model.notice?.contains("stays marked as known") == true)
        }

        @Test("should offer undo only for the latest known mark when several are still saving")
        func overlappingKnownsKeepLatestUndo() async throws {
            let (model, session) = await make([
                Self.known: .sequence([.held(200, Self.knownReply("rev_a")), .held(200, Self.knownReply("rev_b"))])
            ])
            defer { session.end() }

            await model.markCurrentKnown()
            await model.markCurrentKnown()
            try await waitForHeld(2)

            #expect(model.knownUndo?.card.variantId == "v02")

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(model.knownUndo?.card.variantId == "v02")
            #expect(model.knownUndo?.reviewId == "rev_b")
        }

        @Test("should let the learner act on the next card while a suspend or bury is still saving")
        func controlsDoNotBlockNextCard() async throws {
            let (model, session) = await make([Self.schedule: .held(200, Self.scheduleReply)])
            defer { session.end() }

            await model.suspendCurrent(offersUndo: true)
            try await waitForHeld()

            #expect(!model.isGrading)

            await model.markCurrentKnown()

            #expect(model.current?.variantId == "v03")

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(model.suspendedUndo == nil)
            #expect(model.reviewedCount == 1)
        }

        @Test("should keep the shown card and put the suspended one back when the suspend fails after moving on")
        func suspendFailureAfterMovingOn() async throws {
            let (model, session) = await make([Self.schedule: .held(500, "{}")])
            defer { session.end() }

            await model.suspendCurrent(offersUndo: true)
            try await waitForHeld()
            await model.buryCurrent()
            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v03")
            #expect(model.queue.first?.variantId == "v01")
            #expect(model.suspendedUndo == nil)
        }

        @Test("should send the unsuspend only after the suspend for the same card has finished")
        func undoSuspendIsOrderedAfterSuspend() async throws {
            let (model, session) = await make([Self.schedule: .held(200, Self.scheduleReply)])
            defer { session.end() }

            await model.suspendCurrent(offersUndo: true)
            try await waitForHeld()
            await model.undoSuspend()

            #expect(model.current?.variantId == "v01")
            #expect(writes("/knowledge-bits/k01/schedule").count == 1)

            FakeServer.releaseHeld()
            try await waitForHeld()
            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            let sent = writes("/knowledge-bits/k01/schedule").compactMap { $0.bodyObject?["suspended"] as? Bool }

            #expect(sent == [true, false])
            #expect(model.current?.variantId == "v01")
        }
    }
}
