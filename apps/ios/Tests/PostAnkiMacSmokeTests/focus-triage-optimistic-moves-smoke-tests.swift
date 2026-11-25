import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage Inbox, Chat and Undo never block the next card")
    struct FocusTriageOptimisticMovesSmokeTests {
        private let pending = FocusTriageFixtures.list([
            FocusTriageFixtures.source("s1", bits: ["a", "b", "c", "d"].map { FocusTriageFixtures.bit($0) })
        ])
        private let inboxOk = #"{"ok":true,"inboxCount":5}"#
        private let chatOk = #"{"ok":true,"chatCount":2}"#

        private func make(extra: [String: FakeReply]) async -> (FocusTriageModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .json(200, pending)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        @Test("should show the next card and raise the Inbox count at once while the Inbox send is still held")
        func inboxIsImmediate() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/inbox": .held(200, inboxOk)])
            defer { session.end() }

            let before = model.list.counts.inboxCount
            let moved = await model.sendToInbox()

            #expect(moved)
            #expect(model.current?.id == "b")
            #expect(!model.isBusy)
            #expect(model.readyCount == 3)
            #expect(model.sentToInboxCount == 1)
            #expect(model.list.counts.inboxCount == before + 1)
            #expect(model.canUndo)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleMoves()

            #expect(model.list.counts.inboxCount == 5)
            #expect(model.current?.id == "b")
        }

        @Test("should let the learner approve and send further cards while an earlier Inbox send is held")
        func nextActionsWorkWhileHeld() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/inbox": .held(200, inboxOk),
                "POST /knowledge-bits/b/approve": .json(200, "{}"),
                "POST /knowledge-bits/c/chat-queue": .json(200, chatOk)
            ])
            defer { session.end() }

            await model.sendToInbox()
            await model.approve()

            #expect(model.current?.id == "c")
            #expect(await model.sendToChat())
            #expect(model.current?.id == "d")

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(Set(FakeServer.writes.map(\.path)) == ["/knowledge-bits/a/inbox", "/knowledge-bits/b/approve", "/knowledge-bits/c/chat-queue"])
            #expect(model.current?.id == "d")
        }

        @Test("should add the other Inbox sends still in flight to the server count so the badge does not dip")
        func inboxCountKeepsPendingSends() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/inbox": .json(200, #"{"ok":true,"inboxCount":1}"#),
                "POST /knowledge-bits/b/inbox": .held(200, #"{"ok":true,"inboxCount":2}"#)
            ])
            defer { session.end() }

            await model.sendToInbox()
            await model.sendToInbox()
            try await waitForHeld(1)

            let beforeRelease = model.list.counts.inboxCount

            FakeServer.releaseHeld()
            await model.settleMoves()

            #expect(model.list.counts.inboxCount == beforeRelease)
            #expect(model.list.counts.inboxCount == 2)
        }

        @Test("should put only the failed card back behind the shown card when a held Inbox send fails late")
        func lateFailureRestoresOnlyThatCard() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/inbox": .held(500, #"{"error":"boom"}"#)])
            defer { session.end() }

            let before = model.list.counts.inboxCount

            await model.sendToInbox()

            model.notes["b"] = "typing on b"

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleMoves()

            #expect(model.current?.id == "b")
            #expect(model.notes["b"] == "typing on b")
            #expect(model.readyCount == 4)
            #expect(model.list.rowMessages["a"] != nil)
            #expect(model.list.rowMessages["b"] == nil)
            #expect(model.sentToInboxCount == 0)
            #expect(model.list.counts.inboxCount == before)
            #expect(!model.canUndo)

            await model.reject()

            #expect(model.current?.id == "a")
        }

        @Test("should only refresh counts and keep the card removed when the held Inbox send was already decided elsewhere")
        func lateConflictDoesNotRestore() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/inbox": .held(409, #"{"error":"blocked"}"#),
                "/knowledge-bits/pending-review/count": .json(200, #"{"count":3,"attentionCount":0,"inboxCount":0,"triageEnabled":true}"#)
            ])
            defer { session.end() }

            await model.sendToInbox()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleMoves()

            #expect(model.current?.id == "b")
            #expect(model.readyCount == 3)
            #expect(model.sentToInboxCount == 0)
            #expect(!model.canUndo)
            #expect(model.notice == "That item was already decided elsewhere, so it was removed.")
        }

        @Test("should keep a card with a send in flight out of the queue when the list is reloaded meanwhile")
        func reloadDoesNotResurrectPendingCard() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/chat-queue": .held(200, chatOk)])
            defer { session.end() }

            await model.sendToChat()
            await model.load()

            #expect(model.current?.id == "b")
            #expect(model.readyCount == 3)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleMoves()

            #expect(model.readyCount == 3)
            #expect(model.sentToChatCount == 1)
        }

        @Test("should make Undo wait for the held Inbox send and then return the card")
        func undoWaitsForPendingSend() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/inbox": .held(200, inboxOk),
                "DELETE /knowledge-bits/a/inbox": .json(200, #"{"ok":true}"#)
            ])
            defer { session.end() }

            await model.sendToInbox()
            try await waitForHeld(1)

            let undo = Task { await model.undo() }

            try await Task.sleep(for: .milliseconds(100))

            #expect(!FakeServer.writes.map(\.method).contains("DELETE"))

            FakeServer.releaseHeld()
            await undo.value

            #expect(FakeServer.writes.map(\.method) == ["POST", "DELETE"])
            #expect(model.current?.id == "a")
            #expect(model.sentToInboxCount == 0)
        }

        @Test("should do nothing on Undo when the held send failed and already put the card back")
        func undoAfterFailedSendDoesNothing() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/chat-queue": .held(500, #"{"error":"boom"}"#)])
            defer { session.end() }

            await model.sendToChat()
            try await waitForHeld(1)

            let undo = Task { await model.undo() }

            try await Task.sleep(for: .milliseconds(50))
            FakeServer.releaseHeld()
            await undo.value

            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(model.readyCount == 4)
            #expect(!model.canUndo)
        }

        @Test("should bring the card back at once on Undo while the restore request is still held")
        func undoDecisionIsImmediate() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/restore": .held(200, "{}")
            ])
            defer { session.end() }

            await model.approve()
            await model.settlePending()
            await model.undo()

            #expect(model.current?.id == "a")
            #expect(!model.isUndoing)
            #expect(model.log.entries.isEmpty)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(model.current?.id == "a")
            #expect(model.undoMessage == nil)
        }

        @Test("should remove the restored card again with a message when the held restore is refused with 409")
        func lateRestoreConflictRemovesCard() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/restore": .held(409, #"{"error":"changed"}"#)
            ])
            defer { session.end() }

            await model.approve()
            await model.settlePending()
            await model.undo()

            #expect(model.current?.id == "a")

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(model.current?.id == "b")
            #expect(model.undoMessage == "Couldn't undo. That item was already changed.")
            #expect(!model.canUndo)
        }

        @Test("should keep the decision undoable and take the card out again when the held restore fails")
        func lateRestoreFailureReinstatesDecision() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/a/restore": .held(500, #"{"error":"boom"}"#)
            ])
            defer { session.end() }

            await model.approve()
            await model.settlePending()
            await model.undo()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settlePending()

            #expect(model.current?.id == "b")
            #expect(model.undoMessage != nil)
            #expect(model.log.lastDecided?.bitId == "a")
            #expect(model.canUndo)
        }

        @Test("should send the restore with the variants dropped by the original decision")
        func restoreUsesDroppedVariants() async throws {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/approve": .json(200, #"{"ok":true,"dropped":["v1"]}"#),
                "POST /knowledge-bits/a/triage/undo": .json(200, "{}")
            ])
            defer { session.end() }

            await model.approve()
            await model.settlePending()
            model.log.setDropped(bitId: "a", ids: ["v1"])
            await model.undo()
            await model.settlePending()

            #expect(FakeServer.writes.last?.path == "/knowledge-bits/a/triage/undo")
            #expect(FakeServer.writes.last?.bodyObject?["restoreVariantIds"] as? [String] == ["v1"])
            #expect(model.current?.id == "a")
        }
    }
}
