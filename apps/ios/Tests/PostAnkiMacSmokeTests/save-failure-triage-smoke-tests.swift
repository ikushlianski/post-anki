import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("A triage decision the server refuses brings the card back with Retry or Skip")
    struct SaveFailureTriageSmokeTests {
        private let pending = FocusTriageFixtures.list([
            FocusTriageFixtures.source("s1", bits: [
                FocusTriageFixtures.bit("a"),
                FocusTriageFixtures.bit("b"),
                FocusTriageFixtures.bit("c")
            ])
        ])
        private let finished = #"{"id":"ts1","subjectId":null,"status":"finished","startedAt":"2026-10-24T10:00:00.000Z","endedAt":"2026-10-24T10:05:00.000Z","acceptedCount":1,"rejectedCount":0,"feedbackText":"ok","notes":[]}"#

        private func make(extra: [String: FakeReply]) async -> (FocusTriageModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .json(200, pending)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.load()

            return (model, session)
        }

        @Test("should restore and pin the failed card with Retry and Skip, then send the retry")
        func failureRestoresAndRetries() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .json(400, #"{"error":"invalid_input"}"#)])
            defer { session.end() }

            model.notes["a"] = "keep this"
            await model.approve()

            #expect(model.current?.id == "b")

            await model.settlePending()

            #expect(model.saveFailure?.bitId == "a")
            #expect(model.current?.id == "a")
            #expect(model.pinnedBitId == "a")
            #expect(model.notes["a"] == "keep this")
            #expect(!model.canUndo)

            FakeServer.start(["/knowledge-bits/pending-review": .json(200, pending), "POST /knowledge-bits/a/approve": .json(200, "{}")])
            await model.retryFailedSave()

            #expect(model.current?.id == "b")

            await model.settlePending()

            #expect(model.saveFailure == nil)
            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve", "/knowledge-bits/a/grades"])
            #expect(model.log.entries.map(\.bitId) == ["a"])
        }

        @Test("should keep the card in the queue and send nothing more when the failed save is skipped")
        func skipKeepsCard() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .json(400, #"{"error":"invalid_input"}"#)])
            defer { session.end() }

            await model.approve()
            await model.settlePending()
            await model.skipFailedSave()
            await model.settlePending()

            #expect(model.saveFailure == nil)
            #expect(model.current?.id == "a")
            #expect(model.readyCount == 3)
            #expect(FakeServer.writes.count == 1)
        }

        @Test("should not resurrect an unsent card on reload while the connection is down")
        func reloadKeepsUnsentCardHidden() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .failure(.notConnectedToInternet)])
            defer { session.end() }

            await model.approve()
            await model.settlePending()
            await model.load()

            #expect(model.saveFailure == nil)
            #expect(model.current?.id == "b")
            #expect(model.readyCount == 2)
        }

        @Test("should block Finish while a save has failed and allow it after Skip")
        func finishBlockedByFailure() async throws {
            let suiteName = "save-failure-triage-\(UUID().uuidString)"
            let defaults = UserDefaults(suiteName: suiteName) ?? .standard
            let store = FocusTriageSessionStore(defaults: defaults, scope: { "https://one" })

            defaults.removePersistentDomain(forName: suiteName)
            store.save(sessionId: "ts1", decisions: [])

            let (triage, server) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(400, #"{"error":"invalid_input"}"#),
                "POST /triage-sessions/ts1/finish": .json(200, finished)
            ])
            defer { server.end() }

            let model = FocusTriageSessionModel(triage: triage, store: store)

            model.resume()
            await triage.approve()

            #expect(await !model.finish())
            #expect(triage.saveFailure != nil)
            #expect(!FakeServer.writes.map(\.path).contains("/triage-sessions/ts1/finish"))

            await triage.skipFailedSave()

            #expect(await model.finish())
        }
    }
}
