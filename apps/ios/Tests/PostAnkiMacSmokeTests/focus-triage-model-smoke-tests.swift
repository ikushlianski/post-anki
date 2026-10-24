import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage decisions, undo, notes and polling")
    struct FocusTriageModelSmokeTests {
        private let pending = FocusTriageFixtures.list([
            FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [
                FocusTriageFixtures.bit("a", variants: 2),
                FocusTriageFixtures.bit("b"),
                FocusTriageFixtures.bit("w", variants: 0)
            ])
        ])

        private func make(
            extra: [String: FakeReply] = [:],
            interval: Duration = .milliseconds(5)
        ) async -> (FocusTriageModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .json(200, pending)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = FocusTriageModel(list: PendingReviewListModel(), pollInterval: interval)

            await model.load()

            return (model, session)
        }

        @Test("should save an approval at once, drop the card and move to the next ready card")
        func approveAdvances() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .json(200, "{}")])
            defer { session.end() }

            #expect(model.current?.id == "a")

            await model.approve()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve"])
            #expect(model.current?.id == "b")
            #expect(model.readyCount == 1)
            #expect(model.waitingCount == 1)
            #expect(model.canUndo)
            #expect(model.list.pendingUndo == nil)
        }

        @Test("should reject without showing the reject banner or the reason sheet")
        func rejectIsQuiet() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/reject": .json(200, #"{"ok":true,"feedbackId":"fb1"}"#)])
            defer { session.end() }

            await model.reject()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/reject"])
            #expect(model.current?.id == "b")
            #expect(model.list.pendingUndo == nil)
            #expect(model.list.pendingFeedback == nil)
        }

        @Test("should keep the card and say it is offline when the approval cannot reach the server")
        func approveOfflineKeepsCard() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .failure(.notConnectedToInternet)])
            defer { session.end() }

            await model.approve()

            #expect(model.current?.id == "a")
            #expect(model.message == "You're offline. Nothing was changed, try again when you're back.")
            #expect(!model.canUndo)
        }

        @Test("should remove a card someone else already decided and tell the user")
        func decidedElsewhere() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .json(409, #"{"error":"blocked"}"#)])
            defer { session.end() }

            await model.approve()

            #expect(model.current?.id == "b")
            #expect(model.notice == "That item was already decided elsewhere, so it was removed.")
            #expect(!model.canUndo)
        }

        @Test("should bring an approved card back as the current card when Undo is pressed")
        func undoApprove() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/restore": .json(200, "{}")
            ])
            defer { session.end() }

            await model.approve()
            await model.undo()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve", "/knowledge-bits/a/restore"])
            #expect(model.current?.id == "a")
            #expect(!model.canUndo)
        }

        @Test("should undo a rejection and then the decision before it, newest first")
        func undoRejectNewestFirst() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/b/reject": .json(200, #"{"ok":true,"feedbackId":"fb2"}"#),
                "POST /knowledge-bits/b/restore": .json(200, "{}"),
                "POST /knowledge-bits/a/restore": .json(200, "{}")
            ])
            defer { session.end() }

            await model.approve()
            await model.reject()
            await model.undo()

            #expect(model.current?.id == "b")

            await model.undo()

            #expect(model.current?.id == "a")
            #expect(FakeServer.writes.suffix(2).map(\.path) == ["/knowledge-bits/b/restore", "/knowledge-bits/a/restore"])
        }

        @Test("should explain that a decision can no longer be undone when the server says it changed")
        func undoGone() async {
            for status in [404, 409] {
                let (model, session) = await make(extra: [
                    "POST /knowledge-bits/a/approve": .json(200, "{}"),
                    "POST /knowledge-bits/a/restore": .json(status, "{}")
                ])

                await model.approve()
                await model.undo()
                session.end()

                #expect(model.undoMessage == "Couldn't undo. That item was already changed.")
                #expect(model.current?.id == "b")
                #expect(!model.canUndo)
            }
        }

        @Test("should keep the decision and allow another Undo try when offline")
        func undoOfflineRetries() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/restore": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }

            await model.approve()
            await model.undo()

            #expect(model.undoMessage == "You're offline. Try Undo again.")
            #expect(model.canUndo)
        }

        @Test("should save a note on approval as a neutral grade only after the approval succeeded")
        func approveNote() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/grades": .json(200, #"{"ok":true,"feedbackId":"fb3"}"#)
            ])
            defer { session.end() }

            model.notes["a"] = "  nice wording "
            await model.approve()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve", "/knowledge-bits/a/grades"])
            #expect(FakeServer.writes[1].bodyObject?["rating"] as? Int == 3)
            #expect(FakeServer.writes[1].bodyObject?["note"] as? String == "nice wording")
            #expect(model.notice == nil)
        }

        @Test("should save a note on rejection onto the rejection feedback")
        func rejectNote() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/reject": .json(200, #"{"ok":true,"feedbackId":"fb1"}"#),
                "PATCH /knowledge-bit-feedback/fb1": .json(200, "{}")
            ])
            defer { session.end() }

            model.notes["a"] = "too easy"
            await model.reject()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/reject", "/knowledge-bit-feedback/fb1"])
            #expect(FakeServer.writes[1].bodyObject?["note"] as? String == "too easy")
        }

        @Test("should not send the note when the decision failed")
        func noteSkippedOnFailure() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/approve": .json(500, "{}")])
            defer { session.end() }

            model.notes["a"] = "keep me"
            await model.approve()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve"])
            #expect(model.current?.id == "a")
            #expect(model.message == "Couldn't approve this item. Try again.")
        }

        @Test("should keep the decision and say the note was not saved when the note fails")
        func noteFailureKeepsDecision() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/grades": .json(500, "{}")
            ])
            defer { session.end() }

            model.notes["a"] = "note"
            await model.approve()

            #expect(model.notice == "Couldn't save your note.")
            #expect(model.current?.id == "b")
            #expect(model.canUndo)
        }

        @Test("should keep showing the same card across a reload even when a new card is listed ahead of it")
        func pinnedAcrossReload() async {
            let (model, session) = await make()
            defer { session.end() }

            model.pinnedBitId = "b"

            let reloaded = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s0", bits: [FocusTriageFixtures.bit("fresh")]),
                FocusTriageFixtures.source("s1", bits: [FocusTriageFixtures.bit("b")])
            ])
            FakeServer.start(["/knowledge-bits/pending-review": .json(200, reloaded)])

            await model.load()

            #expect(model.current?.id == "b")
            #expect(model.readyCount == 2)
        }

        @Test("should poll while cards are waiting, pick up the finished card and stop once none wait")
        func pollsUntilWritten() async throws {
            let (model, session) = await make()
            defer { session.end() }

            let written = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", bits: [FocusTriageFixtures.bit("a", variants: 2), FocusTriageFixtures.bit("w", variants: 1)])
            ])
            FakeServer.start(["/knowledge-bits/pending-review": .json(200, written)])

            model.startPolling()

            for _ in 0..<200 where model.waitingCount > 0 || model.isPolling { try await Task.sleep(for: .milliseconds(10)) }

            #expect(model.waitingCount == 0)
            #expect(model.readyCount == 2)
            #expect(!model.isPolling)
            #expect(model.current?.id == "a")
            #expect(model.pollAttempts == 1)
        }

        @Test("should poll at most 40 times and never start when nothing is waiting")
        func pollIsBounded() async throws {
            let (model, session) = await make(interval: .milliseconds(1))
            defer { session.end() }

            model.startPolling()

            for _ in 0..<500 where model.isPolling { try await Task.sleep(for: .milliseconds(10)) }

            #expect(model.pollAttempts == 40)
            #expect(model.waitingCount == 1)

            let quiet = FocusTriageModel(list: PendingReviewListModel())

            quiet.startPolling()

            #expect(!quiet.isPolling)
        }

        @Test("should stop polling when the focus view goes away")
        func pollStops() async {
            let (model, session) = await make(interval: .seconds(30))
            defer { session.end() }

            model.startPolling()

            #expect(model.isPolling)

            model.stopPolling()

            #expect(!model.isPolling)
        }
    }
}
