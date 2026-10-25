import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage live recording order")
    struct FocusTriageRecordingOrderSmokeTests {
        private let pending = FocusTriageFixtures.list([
            FocusTriageFixtures.source("s1", bits: [
                FocusTriageFixtures.bit("a"),
                FocusTriageFixtures.bit("b")
            ])
        ])
        private let decision = #"{"id":"ctd1"}"#

        private func make(extra: [String: FakeReply]) async -> (FocusTriageSessionModel, FakeServerSession) {
            let name = "focus-triage-order-\(UUID().uuidString)"
            let defaults = UserDefaults(suiteName: name) ?? .standard
            let store = FocusTriageSessionStore(defaults: defaults, scope: { "https://one" })

            defaults.removePersistentDomain(forName: name)
            store.save(sessionId: "ts1", decisions: [])

            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .json(200, pending)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let triage = FocusTriageModel(list: PendingReviewListModel())

            await triage.load()

            let model = FocusTriageSessionModel(triage: triage, store: store)

            model.resume()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        private var recordings: [RecordedRequest] { FakeServer.writes.filter { $0.path.hasPrefix("/triage-sessions/ts1/decisions") } }

        @Test("should record a decision only after the card's approval has been saved")
        func recordsAfterSave() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .held(200, "{}"),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision)
            ])
            defer { session.end() }

            await model.triage.approve()
            try await waitForHeld(1)
            try await Task.sleep(for: .milliseconds(100))

            #expect(model.triage.current?.id == "b")
            #expect(recordings.isEmpty)

            FakeServer.releaseHeld()
            await model.triage.settlePending()
            await model.settle()

            #expect(recordings.map(\.path) == ["/triage-sessions/ts1/decisions/a"])
            #expect(model.syncNotice == nil)
        }

        @Test("should record nothing when the card's save failed and the card came back")
        func noRecordingOnFailedSave() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .held(500, "{}")])
            defer { session.end() }

            await model.triage.approve()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.triage.settlePending()
            await model.settle()

            #expect(model.triage.current?.id == "a")
            #expect(recordings.isEmpty)
        }

        @Test("should retry a recording once when the server says the decision is not applied yet and then stop")
        func retriesOnceOnConflict() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "PUT /triage-sessions/ts1/decisions/a": .json(409, #"{"error":"decision_not_applied"}"#)
            ])
            defer { session.end() }

            await model.triage.approve()
            await model.triage.settlePending()
            await model.settle()

            #expect(recordings.count == 2)
            #expect(model.syncNotice != nil)
        }

        @Test("should send a recorded decision once and the undo after it")
        func undoFollowsRecording() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/restore": .json(200, "{}"),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision),
                "DELETE /triage-sessions/ts1/decisions/a": .json(200, decision)
            ])
            defer { session.end() }

            await model.triage.approve()
            await model.triage.undo()
            await model.settle()

            #expect(recordings.map(\.method) == ["PUT", "DELETE"])
        }

        @Test("should not retry a recording when the session is already finished and should start a fresh session silently")
        func staleSessionIsReplacedSilently() async throws {
            let started = #"{"id":"ts2","subjectId":null,"status":"open","startedAt":"2026-10-25T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /triage-sessions": .json(201, started),
                "PUT /triage-sessions/ts1/decisions/a": .json(409, #"{"error":"session_finished"}"#),
                "PUT /triage-sessions/ts2/decisions/a": .json(200, decision)
            ])
            defer { session.end() }

            await model.triage.approve()
            await model.triage.settlePending()
            await model.settle()
            await model.settle()

            let puts = FakeServer.writes.filter { $0.method == "PUT" }.map(\.path)

            #expect(puts == ["/triage-sessions/ts1/decisions/a", "/triage-sessions/ts2/decisions/a"])
            #expect(model.sessionId == "ts2")
            #expect(model.syncNotice == nil)
        }

        @Test("should send a note edit only after the decision itself has been recorded")
        func editWaitsForDecision() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .held(200, "{}"),
                "PUT /triage-sessions/ts1/decisions/a": .json(200, decision)
            ])
            defer { session.end() }

            await model.triage.approve()
            try await waitForHeld(1)
            model.setNote("a", "late note")

            let committing = Task { await model.commit("a") }

            try await Task.sleep(for: .milliseconds(100))

            #expect(recordings.isEmpty)

            FakeServer.releaseHeld()
            await committing.value
            await model.settle()

            #expect(recordings.count == 2)
            #expect(recordings.last?.bodyObject?["note"] as? String == "late note")
        }

        @Test("should keep a note within 500 UTF-16 units like the server")
        func noteLengthMatchesServer() {
            let long = String(repeating: "\u{1F600}", count: 300)

            #expect((FocusTriageNote.trimmed(long) ?? "").utf16.count <= 500)
            #expect(FocusTriageNote.trimmed(String(repeating: "a", count: 600))?.utf16.count == 500)
        }
    }
}
