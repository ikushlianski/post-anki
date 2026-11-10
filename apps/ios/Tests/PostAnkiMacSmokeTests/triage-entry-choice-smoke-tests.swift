import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Triage entry offers resume, triage all and subjects together")
    struct TriageEntryChoiceSmokeTests {
        private let started = #"{"id":"ts2","subjectId":null,"status":"open","startedAt":"2026-10-24T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
        private let discarded = #"{"id":"ts1","subjectId":"sub1","status":"discarded","startedAt":"2026-10-24T10:00:00.000Z","endedAt":"2026-10-24T10:05:00.000Z","acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#

        private func defaults() -> UserDefaults {
            let name = "triage-entry-tests-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            return suite
        }

        private func stored(_ subjectId: String?) -> FocusTriageStoredSession {
            FocusTriageStoredSession(server: "https://one", sessionId: "ts1", decisions: [], subjectId: subjectId)
        }

        @Test("should make Triage all the main button when no session is in progress")
        func triageAllWithoutSession() {
            #expect(TriageEntryChoice.primary(stored: nil) == .triageAll)
        }

        @Test("should make Resume the main button when a session is in progress")
        func resumeWithSession() {
            #expect(TriageEntryChoice.primary(stored: stored("sub1")) == .resume)
            #expect(TriageEntryChoice.primary(stored: stored(nil)) == .resume)
        }

        @Test("should name the subject on Resume only when the stored session is scoped")
        func resumeTitleNamesSubject() {
            #expect(TriageEntryChoice.resumeTitle(stored: stored("sub1"), subjectName: "Spanish") == "Resume triage · Spanish")
            #expect(TriageEntryChoice.resumeTitle(stored: stored(nil), subjectName: "Spanish") == "Resume triage")
            #expect(TriageEntryChoice.resumeTitle(stored: stored("sub1"), subjectName: nil) == "Resume triage")
        }

        @Test("should count every pending item for the collapsed list row")
        func countsItems() {
            #expect(TriageEntryChoice.showAllTitle(7) == "Show all items (7)")
        }

        @Test("should start fresh only when the chosen scope differs from the stored session")
        func freshStartDecision() {
            #expect(!TriageEntryChoice.needsFreshStart(stored: nil, subjectId: "sub1"))
            #expect(TriageEntryChoice.needsFreshStart(stored: stored("sub1"), subjectId: nil))
            #expect(TriageEntryChoice.needsFreshStart(stored: stored(nil), subjectId: "sub2"))
            #expect(!TriageEntryChoice.needsFreshStart(stored: stored("sub1"), subjectId: "sub1"))
        }

        @Test("should replace the stored session with a new one for the chosen subject")
        func replacesStoredSession() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })

            store.save(sessionId: "ts1", decisions: [], subjectId: "sub1")

            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a")]),
                FocusTriageFixtures.source("s2", subjectId: "sub2", bits: [FocusTriageFixtures.bit("b")])
            ])
            let server = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, pending),
                "POST /triage-sessions/ts1/discards": .json(200, discarded),
                "POST /triage-sessions": .json(200, started)
            ])
            defer { server.end() }

            let triage = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await triage.load()

            let model = FocusTriageSessionModel(triage: triage, store: store)
            let opened = await model.startFresh(subjectId: "sub2")

            #expect(opened)
            #expect(!model.resumed)
            #expect(store.load()?.sessionId == "ts2")
            #expect(store.load()?.subjectId == "sub2")
            #expect(triage.subjectFilter == "sub2")
            #expect(FakeServer.writes.map(\.path) == ["/triage-sessions/ts1/discards", "/triage-sessions"])
            #expect(!model.busy)
        }

        private func staleSessionSetup(discardReply: FakeReply) async -> (FocusTriageSessionModel, FocusTriageSessionStore, FakeServerSession) {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })

            store.save(sessionId: "ts1", decisions: [], subjectId: "sub1")

            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a")]),
                FocusTriageFixtures.source("s2", subjectId: "sub2", bits: [FocusTriageFixtures.bit("b")])
            ])
            let server = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, pending),
                "POST /triage-sessions/ts1/discards": discardReply,
                "POST /triage-sessions": .json(200, started)
            ])
            let triage = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await triage.load()

            return (FocusTriageSessionModel(triage: triage, store: store), store, server)
        }

        @Test("should keep the stored session and re-enable buttons when the server discard fails")
        func keepsStoredSessionWhenDiscardFails() async {
            let (model, store, server) = await staleSessionSetup(discardReply: .status(500))
            defer { server.end() }

            let opened = await model.startFresh(subjectId: nil)

            #expect(!opened)
            #expect(store.load()?.sessionId == "ts1")
            #expect(model.error != nil)
            #expect(!model.busy)
            #expect(!FakeServer.writes.map(\.path).contains("/triage-sessions"))
        }

        @Test("should replace the stored session when the server says it is already gone")
        func replacesWhenServerForgotSession() async {
            let (model, store, server) = await staleSessionSetup(discardReply: .status(404))
            defer { server.end() }

            #expect(await model.startFresh(subjectId: nil))
            #expect(store.load()?.sessionId == "ts2")
        }

        @Test("should resume the stored session when the same scope is chosen again")
        func sameScopeResumes() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })

            store.save(sessionId: "ts1", decisions: [], subjectId: "sub1")

            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a")])
            ])
            let server = FakeServerSession(["/knowledge-bits/pending-review": .json(200, pending)])
            defer { server.end() }

            let triage = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await triage.load()

            let model = FocusTriageSessionModel(triage: triage, store: store)

            #expect(await model.startFresh(subjectId: "sub1"))
            #expect(model.resumed)
            #expect(store.load()?.sessionId == "ts1")
        }
    }
}
