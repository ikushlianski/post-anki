import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Triage history lists past sessions and their decisions")
    struct TriageHistorySmokeTests {
        private func session(_ id: String, at: String, accepted: Int, rejected: Int, status: String = "finished") -> String {
            #"{"id":"\#(id)","subjectId":null,"status":"\#(status)","startedAt":"\#(at)","endedAt":null,"acceptedCount":\#(accepted),"rejectedCount":\#(rejected),"feedbackText":null,"notes":[]}"#
        }

        private func store() -> TriageHistoryStore {
            let name = "triage-history-tests-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            return TriageHistoryStore(defaults: suite, scope: { "http://test" })
        }

        @Test("should remember every saved triage session once so history survives relaunch")
        func remembersSessions() {
            let history = store()

            FocusTriageSessionStore(defaults: UserDefaults(suiteName: "x-\(UUID().uuidString)") ?? .standard, scope: { "http://test" })
                .save(sessionId: "ts1", decisions: [])
            history.record("ts1")
            history.record("ts1")
            history.record("ts2")

            #expect(history.ids() == ["ts1", "ts2"])
        }

        @Test("should list finished sessions newest first with approved and rejected counts")
        func listsNewestFirst() async {
            let history = store()

            history.record("old")
            history.record("new")
            history.record("empty")

            let fake = FakeServerSession([
                "/triage-sessions/old": .json(200, session("old", at: "2026-10-01T10:00:00.000Z", accepted: 2, rejected: 1)),
                "/triage-sessions/new": .json(200, session("new", at: "2026-10-20T10:00:00.000Z", accepted: 5, rejected: 0)),
                "/triage-sessions/empty": .json(200, session("empty", at: "2026-10-25T10:00:00.000Z", accepted: 0, rejected: 0))
            ])
            defer { fake.end() }

            let model = TriageHistoryModel(store: history)

            await model.load()

            #expect(model.entries.map(\.id) == ["new", "old"])
            #expect(model.entries.first?.approved == 5)
            #expect(model.entries.last?.rejected == 1)
        }

        @Test("should skip sessions the server no longer has")
        func skipsMissing() async {
            let history = store()

            history.record("gone")
            history.record("kept")

            let fake = FakeServerSession([
                "/triage-sessions/gone": .status(404),
                "/triage-sessions/kept": .json(200, session("kept", at: "2026-10-20T10:00:00.000Z", accepted: 1, rejected: 1))
            ])
            defer { fake.end() }

            let model = TriageHistoryModel(store: history)

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.entries.map(\.id) == ["kept"])
        }

        @Test("should show the offline message when history cannot be reached")
        func offline() async {
            let history = store()

            history.record("ts1")

            let fake = FakeServerSession(["/triage-sessions/ts1": .failure(.notConnectedToInternet)])
            defer { fake.end() }

            let model = TriageHistoryModel(store: history)

            await model.load()

            #expect(!model.hasLoaded)
            #expect(model.errorMessage != nil)
        }

        @Test("should group a session's decisions by verdict and hide undone ones")
        func detailGroups() async {
            let body = #"{"decisions":[{"id":"d1","bitId":"a","verdict":"approved","orderIndex":0,"front":"A"},{"id":"d2","bitId":"b","verdict":"rejected","orderIndex":1,"front":"B","note":"vague"},{"id":"d3","bitId":"c","verdict":"approved","orderIndex":2,"front":"C","undoneAt":"2026-10-20T10:00:00.000Z"}]}"#
            let fake = FakeServerSession(["/triage-sessions/ts1/decisions": .json(200, body)])
            defer { fake.end() }

            let model = TriageHistoryDetailModel(sessionId: "ts1")

            await model.load()

            #expect(model.approved.map(\.id) == ["d1"])
            #expect(model.rejected.first?.note == "vague")
        }
    }
}
