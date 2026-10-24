import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage session start, resume, finish and discard")
    struct FocusTriageSessionSmokeTests {
        private let started = #"{"id":"ts1","subjectId":null,"status":"open","startedAt":"2026-10-24T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
        private let finished = #"{"id":"ts1","subjectId":null,"status":"finished","startedAt":"2026-10-24T10:00:00.000Z","endedAt":"2026-10-24T10:05:00.000Z","acceptedCount":1,"rejectedCount":1,"feedbackText":"ok","notes":[{"id":"n1","subjectId":null,"sessionId":"ts1","text":"Prefer short prompts","enabled":true,"createdAt":"2026-10-24T10:05:00.000Z"}]}"#

        private func defaults() -> UserDefaults {
            let name = "focus-triage-tests-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            return suite
        }

        private func make(
            subjectId: String? = "sub1",
            store: FocusTriageSessionStore,
            extra: [String: FakeReply] = [:]
        ) async -> (FocusTriageSessionModel, FakeServerSession) {
            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: subjectId, bits: [FocusTriageFixtures.bit("a"), FocusTriageFixtures.bit("b")])
            ])
            var routes: [String: FakeReply] = [
                "/knowledge-bits/pending-review": .json(200, pending),
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/b/reject": .json(200, #"{"ok":true,"feedbackId":"fb"}"#)
            ]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let triage = FocusTriageModel(list: PendingReviewListModel())

            await triage.load()

            return (FocusTriageSessionModel(triage: triage, store: store), session)
        }

        @Test("should start a session on the single shared subject and remember it")
        func startsWithSubject() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })
            let (model, session) = await make(store: store, extra: ["POST /triage-sessions": .json(200, started)])
            defer { session.end() }

            await model.start()

            #expect(model.isOpen)
            #expect(FakeServer.writes.first?.bodyObject?["subjectId"] as? String == "sub1")
            #expect(store.load()?.sessionId == "ts1")
        }

        @Test("should start a session with no subject when the pending cards span several subjects")
        func startsWithoutSubject() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })
            let (model, session) = await make(subjectId: nil, store: store, extra: ["POST /triage-sessions": .json(200, started)])
            defer { session.end() }

            await model.start()

            #expect(FakeServer.writes.first?.bodyObject?["subjectId"] == nil)
        }

        @Test("should let triage carry on without feedback when the session cannot be started")
        func startFailureStillTriages() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })
            let (model, session) = await make(store: store, extra: ["POST /triage-sessions": .json(500, "{}")])
            defer { session.end() }

            await model.start()
            await model.triage.approve()

            #expect(!model.isOpen)
            #expect(model.error == "Couldn't start triage. Try again.")
            #expect(model.triage.current?.id == "b")
            #expect(store.load() == nil)
        }

        @Test("should resume the stored session on the same server and send its earlier decisions on finish")
        func resumesSameServer() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })

            store.save(sessionId: "ts1", decisions: [TriageDecision(bitId: "old", verdict: .approved)])

            let (model, session) = await make(store: store, extra: ["POST /triage-sessions/ts1/finish": .json(200, finished)])
            defer { session.end() }

            await model.start()
            await model.triage.approve()

            #expect(model.resumed)
            #expect(!FakeServer.writes.contains { $0.path == "/triage-sessions" })
            #expect(store.load()?.decisions.map(\.bitId) == ["old", "a"])

            model.openFinish()

            #expect(await model.finish(feedback: "  ok  "))

            let body = FakeServer.writes.last?.bodyObject
            let sent = body?["decisions"] as? [NSDictionary]

            #expect(body?["feedbackText"] as? String == "ok")
            #expect(sent?.count == 2)
            #expect(model.result?.acceptedCount == 1)
            #expect(model.result?.notes.first?.text == "Prefer short prompts")
            #expect(model.phase == .result)
            #expect(store.load() == nil)
        }

        @Test("should not resume a session that belongs to another server")
        func ignoresOtherServer() async {
            let defaults = defaults()

            FocusTriageSessionStore(defaults: defaults, scope: { "https://other" }).save(sessionId: "tsX", decisions: [])

            let store = FocusTriageSessionStore(defaults: defaults, scope: { "https://one" })
            let (model, session) = await make(store: store, extra: ["POST /triage-sessions": .json(200, started)])
            defer { session.end() }

            await model.start()

            #expect(!model.resumed)
            #expect(model.sessionId == "ts1")
        }

        @Test("should only count decisions made after the session began")
        func countsSessionDecisionsOnly() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })
            let (model, session) = await make(store: store, extra: ["POST /triage-sessions": .json(200, started)])
            defer { session.end() }

            await model.triage.approve()
            await model.start()
            await model.triage.reject()

            #expect(model.acceptedCount == 0)
            #expect(model.rejectedCount == 1)
            #expect(model.decisions.map(\.bitId) == ["b"])
        }

        @Test("should keep the typed feedback and offer a retry when saving fails for another reason")
        func finishFailureKeepsOpen() async {
            let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })
            let (model, session) = await make(store: store, extra: [
                "POST /triage-sessions": .json(200, started),
                "POST /triage-sessions/ts1/finish": .json(500, "{}")
            ])
            defer { session.end() }

            await model.start()
            model.openFinish()

            #expect(!(await model.finish(feedback: "text")))
            #expect(model.phase == .writing)
            #expect(!model.stale)
            #expect(model.error == "Couldn't save the feedback. Your text is kept; try again.")
            #expect(store.load()?.sessionId == "ts1")
        }

        @Test("should mark the session stale when the server no longer knows it and clear it on discard")
        func staleThenDiscard() async {
            for status in [404, 409] {
                let store = FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })
                let (model, session) = await make(store: store, extra: [
                    "POST /triage-sessions": .json(200, started),
                    "POST /triage-sessions/ts1/finish": .json(status, "{}")
                ])

                await model.start()
                model.openFinish()
                _ = await model.finish(feedback: "")

                #expect(model.stale)

                model.discard()
                session.end()

                #expect(!model.stale)
                #expect(!model.isOpen)
                #expect(store.load() == nil)
                #expect(model.phase == .idle)
            }
        }
    }
}
