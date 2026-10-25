import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage finish list shows card fronts")
    struct FocusTriageDecisionTitlesSmokeTests {
        private let started = #"{"id":"ts1","subjectId":null,"status":"open","startedAt":"2026-10-25T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
        private let decision = #"{"id":"ctd1"}"#

        private func store() -> FocusTriageSessionStore {
            let name = "focus-triage-titles-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            return FocusTriageSessionStore(defaults: suite, scope: { "https://one" })
        }

        private func bit(_ id: String, prompt: String?) -> String {
            let variants = prompt.map { #"[{"id":"\#(id)_v","kind":"basic","prompt":"\#($0)","answer":"ans \#(id)"}]"# } ?? "[]"

            return #"{"id":"\#(id)","body":"joined body \#(id)","background":null,"origin":"extracted","variants":\#(variants)}"#
        }

        private func make(extra: [String: FakeReply] = [:]) async -> (FocusTriageSessionModel, FakeServerSession) {
            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", bits: [bit("a", prompt: "Front A"), bit("b", prompt: "Front B"), bit("c", prompt: nil)])
            ])
            var routes: [String: FakeReply] = [
                "/knowledge-bits/pending-review": .json(200, pending),
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/b/reject": .json(200, #"{"ok":true,"feedbackId":"fb"}"#),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision),
                "PUT /triage-sessions/ts1/decisions/b": .json(200, decision)
            ]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let triage = FocusTriageModel(list: PendingReviewListModel())

            await triage.load()

            return (FocusTriageSessionModel(triage: triage, store: store()), session)
        }

        @Test("should list accepted and rejected cards by their front text after the saves settle")
        func rowsShowFrontsOfCardsDecidedInThisRun() async {
            let (model, session) = await make(extra: ["POST /triage-sessions": .json(201, started)])
            defer { session.end() }

            await model.start()
            await model.triage.approve()
            await model.triage.settlePending()
            await model.triage.reject()
            await model.triage.settlePending()
            await model.settle()

            #expect(model.decisionRows.map(\.title) == ["Front A", "Front B"])
            #expect(model.decisionRows.map(\.verdict) == [.approved, .rejected])
        }

        @Test("should fall back to the card body only when the card has no question")
        func fallsBackToBodyWithoutVariant() {
            let decoded = try? JSONDecoder().decode(PendingReviewBit.self, from: Data(bit("c", prompt: nil).utf8))

            #expect(decoded.map(FocusTriageDecisionEntry.frontText(of:)) == "joined body c")
        }

        @Test("should show the stored fronts for cards decided in an earlier run of a resumed session")
        func resumedRowsUseServerFronts() async {
            let records = #"{"decisions":[{"id":"d1","bitId":"old1","verdict":"approved","front":"Old front 1"},{"id":"d2","bitId":"old2","verdict":"rejected","front":"Old front 2"}]}"#
            let (model, session) = await make(extra: ["/triage-sessions/ts1/decisions": .json(200, records)])
            defer { session.end() }

            model.store.save(
                sessionId: "ts1",
                decisions: [TriageDecision(bitId: "old1", verdict: .approved), TriageDecision(bitId: "old2", verdict: .rejected)]
            )
            model.resume()
            await model.loadServerFronts()

            #expect(model.decisionRows.map(\.title) == ["Old front 1", "Old front 2"])
            #expect(model.decisionRows.map(\.verdict) == [.approved, .rejected])
        }
    }
}
