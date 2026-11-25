import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Admin settings show a change at once and save it in the background")
    struct AdminSettingsOptimisticSmokeTests {
        private static let path = "PATCH /admin/settings"

        private static func settingsJSON(
            tier: String = "cheap",
            cards: Int = 20,
            triage: Bool = false
        ) -> String {
            """
            {"testToggle":true,"modelTier":"\(tier)","newCardsPerDay":\(cards),"maxReviewsPerDay":100,\
            "mixNewWithDue":true,"triageEnabled":\(triage)}
            """
        }

        private func make(_ replies: [FakeReply]) async -> (AdminSettingsModel, FakeServerSession) {
            let session = FakeServerSession([
                "/admin/settings": .json(200, Self.settingsJSON()),
                Self.path: .sequence(replies)
            ])
            let model = AdminSettingsModel()

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        private func body(_ index: Int) -> NSDictionary? {
            FakeServer.writes[index].bodyObject
        }

        @Test("should show the new value at once and let a second setting change while the first save is held")
        func secondChangeWorksWhileFirstHeld() async throws {
            let (model, session) = await make([
                .held(200, Self.settingsJSON(tier: "premium")),
                .held(200, Self.settingsJSON(tier: "premium", triage: true))
            ])
            defer { session.end() }

            model.setModelTier("premium")

            #expect(model.modelTier == "premium")

            try await waitForHeld(1)
            model.setTriageEnabled(true)

            #expect(model.triageEnabled)
            #expect(model.modelTier == "premium")
            #expect(FakeServer.writes.count == 1)

            FakeServer.releaseHeld()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(FakeServer.writes.count == 2)
            #expect(body(0) == ["modelTier": "premium"] as NSDictionary)
            #expect(body(1) == ["triageEnabled": true] as NSDictionary)
            #expect(model.failedField == nil)
        }

        @Test("should keep a newer pending change on screen when an older save returns the old value")
        func olderResponseDoesNotOverwriteNewerChange() async throws {
            let (model, session) = await make([
                .held(200, Self.settingsJSON()),
                .held(200, Self.settingsJSON(triage: true))
            ])
            defer { session.end() }

            model.setNewCardsPerDay(30)
            try await waitForHeld(1)
            model.setNewCardsPerDay(40)
            FakeServer.releaseHeld()
            try await waitForHeld(1)

            #expect(model.newCardsPerDay == 40)

            FakeServer.releaseHeld()
            await model.settle()
        }

        @Test("should send one request with the latest value when stepper taps arrive during a held save")
        func stepperTapsCoalesce() async throws {
            let (model, session) = await make([
                .held(200, Self.settingsJSON(cards: 21)),
                .held(200, Self.settingsJSON(cards: 24))
            ])
            defer { session.end() }

            model.setNewCardsPerDay(21)
            try await waitForHeld(1)
            model.setNewCardsPerDay(22)
            model.setNewCardsPerDay(23)
            model.setNewCardsPerDay(24)

            #expect(model.newCardsPerDay == 24)

            FakeServer.releaseHeld()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(FakeServer.writes.count == 2)
            #expect(body(1) == ["newCardsPerDay": 24] as NSDictionary)
            #expect(model.newCardsPerDay == 24)
        }

        @Test("should put the old value back and say the save failed when the server refuses a change")
        func failureRestoresOldValue() async throws {
            let (model, session) = await make([.held(400, #"{"error":"invalid_input"}"#)])
            defer { session.end() }

            model.setModelTier("premium")

            #expect(model.modelTier == "premium")

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.modelTier == "cheap")
            #expect(model.failedField == .modelTier)
            #expect(model.hasFailed(.modelTier))
            #expect(model.refusalMessage == "The server refused these settings.")
        }

        @Test("should restore only the failed change and keep a newer change to another setting")
        func failureKeepsUnrelatedChange() async throws {
            let (model, session) = await make([
                .held(401, "{}"),
                .held(200, Self.settingsJSON(triage: true))
            ])
            defer { session.end() }

            model.setModelTier("premium")
            try await waitForHeld(1)
            model.setTriageEnabled(true)
            FakeServer.releaseHeld()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.modelTier == "cheap")
            #expect(model.triageEnabled)
        }
    }
}
