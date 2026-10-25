import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage optimistic decisions")
    struct FocusTriageOptimisticSmokeTests {
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
            let model = FocusTriageModel(list: PendingReviewListModel())

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        @Test("should show the next card at once while the approval is still on its way to the server")
        func nextCardIsImmediate() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .held(200, "{}")])
            defer { session.end() }

            await model.approve()

            #expect(model.current?.id == "b")
            #expect(model.readyCount == 2)
            #expect(model.canUndo)

            try await waitForHeld(1)

            #expect(FakeServer.heldCount == 1)

            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(model.current?.id == "b")
        }

        @Test("should send both decisions to the server when two cards are swiped before the first one answers")
        func twoQuickDecisions() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .held(200, "{}"),
                "POST /knowledge-bits/b/reject": .held(200, #"{"ok":true,"feedbackId":"fb"}"#)
            ])
            defer { session.end() }

            await model.approve()
            await model.reject()

            #expect(model.current?.id == "c")

            try await waitForHeld(2)

            #expect(FakeServer.heldCount == 2)

            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(Set(FakeServer.writes.map(\.path)) == ["/knowledge-bits/a/approve", "/knowledge-bits/b/reject"])
            #expect(model.log.entries.map(\.bitId) == ["a", "b"])
        }

        @Test("should bring a card back with its note and say so when the server could not save the decision")
        func failedDecisionRestoresCard() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .held(500, "{}")])
            defer { session.end() }

            model.notes["a"] = "keep this"
            await model.approve()

            #expect(model.current?.id == "b")
            #expect(model.notes["a"] == nil)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(model.current?.id == "a")
            #expect(model.notes["a"] == "keep this")
            #expect(model.notice == "Couldn't save that decision. The card is back in the queue.")
            #expect(model.readyCount == 3)
            #expect(!model.canUndo)
        }

        @Test("should make Undo wait for a decision that is still being saved before restoring the card")
        func undoWaitsForPendingSave() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .held(200, "{}"),
                "POST /knowledge-bits/a/restore": .json(200, "{}")
            ])
            defer { session.end() }

            await model.approve()
            try await waitForHeld(1)

            let undo = Task { await model.undo() }

            try await Task.sleep(for: .milliseconds(100))

            #expect(!FakeServer.writes.map(\.path).contains("/knowledge-bits/a/restore"))
            #expect(model.current?.id == "b")

            FakeServer.releaseHeld()
            await undo.value

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve", "/knowledge-bits/a/restore"])
            #expect(model.current?.id == "a")
        }

        @Test("should do nothing more on Undo when the pending save failed and already put the card back")
        func undoAfterFailedSaveDoesNothing() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .held(500, "{}")])
            defer { session.end() }

            await model.approve()
            try await waitForHeld(1)

            let undo = Task { await model.undo() }

            try await Task.sleep(for: .milliseconds(50))
            FakeServer.releaseHeld()
            await undo.value

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve"])
            #expect(model.current?.id == "a")
            #expect(model.readyCount == 3)
        }

        @Test("should wait for every pending decision before sending the session log on finish")
        func finishWaitsForPendingSaves() async throws {
            let suiteName = "focus-triage-optimistic-\(UUID().uuidString)"
            let defaults = UserDefaults(suiteName: suiteName) ?? .standard
            let store = FocusTriageSessionStore(defaults: defaults, scope: { "https://one" })

            defaults.removePersistentDomain(forName: suiteName)
            store.save(sessionId: "ts1", decisions: [])

            let (triage, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .held(200, "{}"),
                "POST /triage-sessions/ts1/finish": .json(200, finished)
            ])
            defer { session.end() }

            let model = FocusTriageSessionModel(triage: triage, store: store)

            model.resume()
            await triage.approve()
            try await waitForHeld(1)

            let finishing = Task { await model.finish(feedback: "ok") }

            try await Task.sleep(for: .milliseconds(100))

            #expect(!FakeServer.writes.map(\.path).contains("/triage-sessions/ts1/finish"))

            FakeServer.releaseHeld()

            let done = await finishing.value

            #expect(done)

            let paths = FakeServer.writes.map(\.path)

            #expect(paths.contains("/knowledge-bits/a/approve"))
            #expect(paths.last == "/triage-sessions/ts1/finish")
        }

        @Test("should not bring a card back through a reload while its decision is still pending")
        func reloadDoesNotResurrectPendingCard() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .held(200, "{}")])
            defer { session.end() }

            await model.approve()
            try await waitForHeld(1)
            await model.load()

            #expect(model.current?.id == "b")
            #expect(model.readyCount == 2)

            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(model.current?.id == "b")
            #expect(model.readyCount == 2)
        }
    }
}
