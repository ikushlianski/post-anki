import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Per-card suspend on the item detail changes the card at once and rolls back only that card")
    struct ItemDetailOptimisticSmokeTests {
        private static let detail = """
        {"knowledgeBitId":"kb_1","cards":[\
        {"variantId":"v1","cardKey":"wh:1","kind":"wh","order":1,"state":"review","dueAt":null,"lapses":0,"suspended":false,"buried":false},\
        {"variantId":"v2","cardKey":"wh:2","kind":"wh","order":2,"state":"review","dueAt":null,"lapses":0,"suspended":false,"buried":false}]}
        """

        private func make(_ extra: [String: FakeReply]) async -> (KnowledgeItemCardsModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/kb_1": .json(200, Self.detail)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = KnowledgeItemCardsModel(bitId: "kb_1")

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        @Test("should show a suspended card at once and let the other card be changed while the first save is held")
        func secondCardWhileHeld() async throws {
            let ok = #"{"knowledgeBitId":"kb_1","suspended":true,"buriedUntil":null,"leech":false,"cardKey":null}"#
            let (model, session) = await make(["PATCH /knowledge-bits/kb_1/schedule": .held(200, ok)])
            defer { session.end() }

            await model.apply(model.cards[0], suspended: true, buried: nil)

            #expect(model.cards[0].suspended)

            try await waitForHeld(1)
            await model.apply(model.cards[1], suspended: true, buried: nil)

            #expect(model.cards[1].suspended)

            FakeServer.releaseHeld()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.message == nil)
        }

        @Test("should put back only the card whose late save failed and say so")
        func lateFailureRestoresOnlyThatCard() async throws {
            let (model, session) = await make(["PATCH /knowledge-bits/kb_1/schedule": .held(500, "{}")])
            defer { session.end() }

            await model.apply(model.cards[0], suspended: true, buried: nil)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(!model.cards[0].suspended)
            #expect(!model.cards[1].suspended)
            #expect(model.message != nil)
        }
    }
}
