import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("The learner keeps answering cards while a move to another deck is still being saved")
    struct ReviewPendingMoveSmokeTests {
        private static let moves = "POST /knowledge-bits/moves"
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

        @Test("should let the learner act on the next card while a move is still saving, and not move the same card twice")
        func moveDoesNotBlockNextCard() async throws {
            let (model, session) = await make([Self.moves: .held(200, Self.movedReply)])
            defer { session.end() }

            let first = try #require(model.current)

            model.presentMovePicker()

            #expect(await model.moveCurrent(toSubject: "s1", label: "English"))
            try await waitForHeld()

            model.movePickerCard = first

            #expect(!(await model.moveCurrent(toSubject: "s1", label: "English")))
            #expect(model.movePickerCard != nil)

            model.movePickerCard = nil
            await model.markCurrentKnown()

            #expect(model.current?.variantId == "v03")

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(writes("/knowledge-bits/moves").count == 1)
        }

        @Test("should remember the deck only after the move is confirmed")
        func recentsRecordedOnSuccessOnly() async throws {
            let (model, session) = await make([Self.moves: .held(200, Self.movedReply)])
            defer { session.end() }

            let defaults = UserDefaults(suiteName: "pending-move-\(UUID().uuidString)") ?? .standard
            let store = RecentMoveTargets(defaults: defaults)

            model.presentMovePicker()
            _ = await model.moveCurrent(toSubject: "s1", label: "English", recents: store)
            try await waitForHeld()

            #expect(store.load().isEmpty)

            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(store.load() == ["s1"])
        }

        @Test("should bring the card back with the server's reason and no remembered deck when the move is skipped")
        func skippedMoveAfterMovingOn() async throws {
            let skipped = #"{"moved":[],"skipped":[{"id":"k01","reason":"not_approved"}]}"#
            let (model, session) = await make([Self.moves: .held(200, skipped)])
            defer { session.end() }

            let defaults = UserDefaults(suiteName: "pending-move-\(UUID().uuidString)") ?? .standard
            let store = RecentMoveTargets(defaults: defaults)

            model.presentMovePicker()
            _ = await model.moveCurrent(toSubject: "s1", label: "English", recents: store)
            try await waitForHeld()
            FakeServer.releaseHeld()
            await model.settleBackgroundActions()

            #expect(model.current?.variantId == "v02")
            #expect(model.queue.first?.variantId == "v01")
            #expect(model.notice?.contains("not approved") == true)
            #expect(store.load().isEmpty)
        }
    }
}
