import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage explicit start, per-card feedback and discard")
    struct FocusTriageStartSmokeTests {
        private let started = #"{"id":"ts1","subjectId":null,"status":"open","startedAt":"2026-10-25T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
        private let finished = #"{"id":"ts1","subjectId":null,"status":"distilled","startedAt":"2026-10-25T10:00:00.000Z","endedAt":"2026-10-25T10:05:00.000Z","acceptedCount":1,"rejectedCount":1,"feedbackText":null,"notes":[]}"#
        private let decision = #"{"id":"ctd1"}"#

        private func defaults() -> UserDefaults {
            let name = "focus-triage-start-tests-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            return suite
        }

        private func make(
            store: FocusTriageSessionStore,
            extra: [String: FakeReply] = [:]
        ) async -> (FocusTriageSessionModel, FakeServerSession) {
            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [
                    FocusTriageFixtures.bit("a"),
                    FocusTriageFixtures.bit("b"),
                    FocusTriageFixtures.bit("c")
                ])
            ])
            var routes: [String: FakeReply] = [
                "/knowledge-bits/pending-review": .json(200, pending),
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/b/reject": .json(200, #"{"ok":true,"feedbackId":"fb"}"#),
                "POST /knowledge-bits/a/restore": .json(200, "{}")
            ]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let triage = FocusTriageModel(list: PendingReviewListModel())

            await triage.load()

            return (FocusTriageSessionModel(triage: triage, store: store), session)
        }

        private func store() -> FocusTriageSessionStore {
            FocusTriageSessionStore(defaults: defaults(), scope: { "https://one" })
        }

        @Test("should register the session as the iOS client with a start key before triage opens")
        func startRegistersFirst() async {
            let (model, session) = await make(store: store(), extra: ["POST /triage-sessions": .json(201, started)])
            defer { session.end() }

            let opened = await model.start()
            let body = FakeServer.writes.first?.bodyObject

            #expect(opened)
            #expect(model.isOpen)
            #expect(body?["client"] as? String == "ios")
            #expect((body?["startKey"] as? String)?.isEmpty == false)
        }

        @Test("should resume a stored session without starting a new one when the focus view appears")
        func resumeNeverStarts() async {
            let sessions = store()

            let (fresh, freshServer) = await make(store: sessions)

            fresh.resume()
            freshServer.end()

            #expect(!fresh.isOpen)
            #expect(FakeServer.writes.isEmpty)

            sessions.save(sessionId: "ts9", decisions: [])

            let (model, session) = await make(store: sessions)
            defer { session.end() }

            model.resume()

            #expect(model.isOpen)
            #expect(model.resumed)
            #expect(model.sessionId == "ts9")
            #expect(FakeServer.writes.isEmpty)
        }

        @Test("should retry a failed start with the same key so one tap never makes two sessions")
        func retryReusesKey() async {
            let (model, session) = await make(store: store(), extra: ["POST /triage-sessions": .json(500, "{}")])

            #expect(await model.start() == false)

            let first = FakeServer.writes.first?.bodyObject?["startKey"] as? String

            session.end()

            let again = FakeServerSession(["POST /triage-sessions": .json(201, started)])
            defer { again.end() }

            #expect(await model.start())

            let second = FakeServer.writes.first?.bodyObject?["startKey"] as? String

            #expect(first != nil)
            #expect(first == second)
        }

        @Test("should record each decision with its note and dwell time and never block the queue when recording fails")
        func decisionsAreRecordedAndFailuresDoNotBlock() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision),
                "PUT /triage-sessions/ts1/decisions/b": .json(500, "{}")
            ])
            defer { session.end() }

            await model.start()
            model.triage.notes["a"] = "  clear  "
            await model.triage.approve()
            await model.triage.settlePending()
            await model.triage.reject()
            await model.triage.settlePending()
            await model.settle()

            let puts = FakeServer.writes.filter { $0.method == "PUT" }

            #expect(puts.map(\.path) == ["/triage-sessions/ts1/decisions/a", "/triage-sessions/ts1/decisions/b"])
            #expect(puts.first?.bodyObject?["verdict"] as? String == "approved")
            #expect(puts.first?.bodyObject?["note"] as? String == "clear")
            #expect(puts.first?.bodyObject?["dwellMs"] as? Int != nil)
            #expect(model.triage.current?.id == "c")
            #expect(model.syncNotice != nil)
            #expect(model.decisions.map(\.bitId) == ["a", "b"])
            #expect(model.decisions.first?.note == "clear")
        }

        @Test("should delete the recorded decision when it is undone")
        func undoDeletes() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision),
                "DELETE /triage-sessions/ts1/decisions/a": .json(200, decision)
            ])
            defer { session.end() }

            await model.start()
            await model.triage.approve()
            await model.triage.settlePending()
            await model.triage.undo()
            await model.settle()

            let methods = FakeServer.writes.map(\.method)

            #expect(methods.last == "DELETE")
            #expect(methods.firstIndex(of: "PUT") ?? .max < methods.count - 1)
            #expect(model.decisions.isEmpty)
        }

        @Test("should save an edited note and reason before finishing and send them with the undecided count")
        func editsAreSavedThenFinished() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision),
                "PUT /triage-sessions/ts1/decisions/b": .json(200, decision),
                "POST /triage-sessions/ts1/finish": .json(200, finished)
            ])
            defer { session.end() }

            await model.start()
            await model.triage.approve()
            await model.triage.settlePending()
            await model.triage.reject()
            await model.triage.settlePending()
            model.openFinish()
            model.setNote("b", "odd blank")
            model.setReason("b", .badFormat)

            #expect(await model.finish(feedback: ""))

            let puts = FakeServer.writes.filter { $0.method == "PUT" }
            let last = puts.last?.bodyObject
            let body = FakeServer.writes.last?.bodyObject
            let sent = body?["decisions"] as? [NSDictionary]

            #expect(last?["note"] as? String == "odd blank")
            #expect(last?["reasonCode"] as? String == "bad_format")
            #expect(body?["undecidedCount"] as? Int == 1)
            #expect(sent?.last?["note"] as? String == "odd blank")
            #expect(sent?.last?["reasonCode"] as? String == "bad_format")
        }

        @Test("should send the latest edit last and keep the card marked unsaved when an older save finishes after a newer edit")
        func latestEditWins() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision)
            ])
            defer { session.end() }

            await model.start()
            await model.triage.approve()
            await model.triage.settlePending()
            await model.settle()
            model.setNote("a", "first")

            let older = Task { await model.commit("a") }

            model.setNote("a", "second")
            await older.value
            await model.flushEdits()

            let notes = FakeServer.writes.filter { $0.method == "PUT" }.compactMap { $0.bodyObject?["note"] as? String }

            #expect(notes.last == "second")
            #expect(model.dirty.isEmpty)
        }

        @Test("should mint a new start key when the subject changes between a failed start and its retry")
        func newKeyForNewSubject() async {
            let (model, session) = await make(store: store(), extra: ["POST /triage-sessions": .json(500, "{}")])

            model.triage.subjectFilter = "sub1"
            await model.start()

            let first = FakeServer.writes.first?.bodyObject?["startKey"] as? String

            await model.start()

            let same = FakeServer.writes.last?.bodyObject?["startKey"] as? String

            model.triage.subjectFilter = "sub2"
            await model.start()

            let other = FakeServer.writes.last?.bodyObject?["startKey"] as? String

            session.end()

            #expect(first != nil)
            #expect(first == same)
            #expect(other != first)
        }

        @Test("should send pending decision saves before the finish request without blocking the decision itself")
        func finishWaitsForSaves() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision),
                "POST /triage-sessions/ts1/finish": .json(200, finished)
            ])
            defer { session.end() }

            await model.start()
            await model.triage.approve()
            await model.triage.settlePending()
            model.openFinish()
            _ = await model.finish(feedback: "")

            #expect(FakeServer.writes.map(\.method) == ["POST", "POST", "PUT", "POST"])
            #expect(model.syncNotice == nil)
        }

        @Test("should not show a save warning from a request that fails after the session was discarded")
        func staleFailureIsIgnored() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(500, "{}"),
                "POST /triage-sessions/ts1/discards": .json(200, started)
            ])
            defer { session.end() }

            await model.start()
            await model.triage.approve()
            await model.triage.settlePending()
            await model.discard()
            await model.settle()

            #expect(model.syncNotice == nil)
        }

        @Test("should not accept a reject reason on an approved card")
        func approvedCardsTakeNoReason() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision)
            ])
            defer { session.end() }

            await model.start()
            await model.triage.approve()
            await model.triage.settlePending()
            model.setReason("a", .badFormat)

            #expect(model.decisions.first?.reasonCode == nil)
        }

        @Test("should finish with nothing decided and still send the undecided count")
        func finishWithZeroDecisions() async {
            let (model, session) = await make(store: store(), extra: [
                "POST /triage-sessions": .json(201, started),
                "POST /triage-sessions/ts1/finish": .json(200, finished)
            ])
            defer { session.end() }

            await model.start()
            model.openFinish()

            #expect(await model.finish(feedback: ""))

            let body = FakeServer.writes.last?.bodyObject

            #expect((body?["decisions"] as? [Any])?.isEmpty == true)
            #expect(body?["undecidedCount"] as? Int == 3)
        }

        @Test("should tell the server about a discard and still clear locally when the server says gone")
        func discardHitsServer() async {
            for status in [200, 404, 409] {
                let sessions = store()
                let (model, session) = await make(store: sessions, extra: [
                    "POST /triage-sessions": .json(201, started),
                    "POST /triage-sessions/ts1/discards": .json(status, started)
                ])

                await model.start()
                await model.discard()

                #expect(FakeServer.writes.last?.path == "/triage-sessions/ts1/discards")
                #expect(!model.isOpen)
                #expect(sessions.load() == nil)
                session.end()
            }
        }

        @Test("should keep a stored session that was saved before notes existed")
        func oldStoredDecisionsLoad() {
            let suite = defaults()
            let sessions = FocusTriageSessionStore(defaults: suite, scope: { "https://one" })
            let legacy = #"{"server":"https://one","sessionId":"ts1","decisions":[{"bitId":"a","verdict":"approved"}]}"#

            suite.set(Data(legacy.utf8), forKey: FocusTriageSessionStore.key)

            #expect(sessions.load()?.decisions.first?.note == nil)
        }
    }
}
