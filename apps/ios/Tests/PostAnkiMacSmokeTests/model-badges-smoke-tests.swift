import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Fusion cards show which models produced them and Mac triage lands in history")
    struct ModelBadgesSmokeTests {
        private func response(_ id: String) throws -> TriageSessionResponse {
            let json = #"{"id":"\#(id)","subjectId":null,"status":"open","startedAt":"2026-10-25T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#

            return try JSONDecoder().decode(TriageSessionResponse.self, from: Data(json.utf8))
        }

        private func history() -> TriageHistoryStore {
            let name = "mac-recorder-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            return TriageHistoryStore(defaults: suite, scope: { "http://test" })
        }

        private func recorder(
            store: TriageHistoryStore,
            finished: @escaping @MainActor (String, [TriageDecision], Int) -> Void = { _, _, _ in }
        ) -> MacTriageSessionRecorder {
            let started = (try? response("ts1"))!

            return MacTriageSessionRecorder(
                history: { store },
                starter: { _, _ in started },
                finisher: { id, decisions, undecided in
                    await finished(id, decisions, undecided)

                    return started
                }
            )
        }

        @Test("should show a badge named after the last path segment of each model id")
        func shortNames() {
            #expect(ModelBadgeName.short("anthropic/claude-haiku-5.5") == "claude-haiku-5.5")
            #expect(ModelBadgeName.short("openrouter/anthropic/claude-haiku-5.5") == "claude-haiku-5.5")
            #expect(ModelBadgeName.short("plain-model") == "plain-model")
        }

        @Test("should decode model ids on a pending bit and default to none")
        func decodesBits() throws {
            let sources = try JSONDecoder().decode(
                [PendingReviewSource].self,
                from: Data(FocusTriageFixtures.list([
                    FocusTriageFixtures.source("s1", bits: [
                        #"{"id":"f","body":"b","origin":"extracted","variants":[],"modelIds":["a/m1","b/m2"]}"#,
                        FocusTriageFixtures.bit("plain")
                    ])
                ]).utf8)
            )

            #expect(sources.first?.bits.first?.modelIds == ["a/m1", "b/m2"])
            #expect(sources.first?.bits.last?.modelIds == [])
        }

        @Test("should record a Mac triage session in history when it starts")
        func recordsHistory() async {
            let store = history()
            let recorder = recorder(store: store)

            await recorder.begin(subjectId: nil)

            #expect(store.ids() == ["ts1"])
        }

        @Test("should send the keep and reject choices when the Mac session ends and drop undone ones")
        func finishesWithDecisions() async {
            var sent: (String, [TriageDecision], Int)?
            let recorder = recorder(store: history(), finished: { sent = ($0, $1, $2) })

            await recorder.begin(subjectId: nil)
            recorder.record(bitId: "a", verdict: .approved)
            recorder.record(bitId: "b", verdict: .rejected)
            recorder.record(bitId: "c", verdict: .approved)
            recorder.undo(bitId: "c")
            await recorder.end(undecidedCount: 4)

            #expect(sent?.0 == "ts1")
            #expect(sent?.1.map(\.bitId) == ["a", "b"])
            #expect(sent?.1.map(\.verdict) == [.approved, .rejected])
            #expect(sent?.2 == 4)
            #expect(recorder.sessionId == nil)
        }

        @Test("should ignore decisions when no session was started")
        func ignoresWithoutSession() {
            let recorder = recorder(store: history())

            recorder.record(bitId: "a", verdict: .approved)

            #expect(recorder.decisions.isEmpty)
        }
    }
}
