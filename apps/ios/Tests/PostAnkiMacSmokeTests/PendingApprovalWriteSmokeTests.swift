import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Pending approval decisions leave the list at once, save in the background and come back on failure")
    struct PendingApprovalWriteSmokeTests {
        private func loadedModel(extra: [String: FakeReply]) async -> (PendingReviewListModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .fixture("pending-review")]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = PendingReviewListModel(decisionQueue: .isolated())

            await model.load()

            return (model, session)
        }

        private func bitIds(_ model: PendingReviewListModel) -> [String] {
            model.sources.flatMap(\.bits).map(\.id)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        @Test("should remove the item at once and post the approval in the background")
        func approveSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/approve": .json(200, "{}")])
            defer { session.end() }

            let outcome = await model.decide(.approve, bitId: "kb_10")

            guard case .removed = outcome else { Issue.record("expected removed, got \(outcome)"); return }

            #expect(bitIds(model) == ["kb_11"])

            await model.settleDecisions()

            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/approve"])
            #expect(bitIds(model) == ["kb_11"])
            #expect(model.rowMessages["kb_10"] == nil)
        }

        @Test("should remove a rejected item at once, offer undo and post the rejection in the background")
        func rejectSucceeds() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/reject": .json(200, #"{"ok":true,"feedbackId":"fb_01"}"#)
            ])
            defer { session.end() }

            let outcome = await model.decide(.reject, bitId: "kb_10")

            guard case .removed = outcome else { Issue.record("expected removed, got \(outcome)"); return }

            #expect(bitIds(model) == ["kb_11"])
            #expect(model.pendingUndo?.removed.bit.id == "kb_10")

            await model.settleDecisions()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/reject"])
            model.dismissUndo()
        }

        @Test("should accept the next decision while the previous one is still being sent")
        func nextDecisionWhileHeld() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/approve": .held(200, "{}"),
                "POST /knowledge-bits/kb_11/reject": .json(200, #"{"ok":true,"feedbackId":null}"#)
            ])
            defer { session.end() }

            _ = await model.decide(.approve, bitId: "kb_10")

            try await waitForHeld(1)

            let second = await model.decide(.reject, bitId: "kb_11")

            guard case .removed = second else { Issue.record("expected removed, got \(second)"); return }

            #expect(bitIds(model).isEmpty)

            FakeServer.releaseHeld()
            await model.settleDecisions()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/approve", "/knowledge-bits/kb_11/reject"])
            model.dismissUndo()
        }

        @Test("should put back only the item the server refused and say why, leaving the other decision in place")
        func lateFailureRestoresOnlyThatRow() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/approve": .held(409, #"{"error":"no_variant"}"#),
                "POST /knowledge-bits/kb_11/reject": .json(200, #"{"ok":true,"feedbackId":null}"#)
            ])
            defer { session.end() }

            _ = await model.decide(.approve, bitId: "kb_10")
            _ = await model.decide(.reject, bitId: "kb_11")

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleDecisions()

            #expect(bitIds(model) == ["kb_10"])
            #expect(model.rowMessages["kb_10"] == "This item has no questions yet, so it can't be approved.")
            #expect(model.rowMessages["kb_11"] == nil)
            model.dismissUndo()
        }

        @Test("should bring a rejected item back with a message and drop its undo when the server errors out")
        func rejectFailureRestores() async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/reject": .json(500, "{}")])
            defer { session.end() }

            _ = await model.decide(.reject, bitId: "kb_10")
            await model.settleDecisions()

            #expect(bitIds(model) == ["kb_10", "kb_11"])
            #expect(model.rowMessages["kb_10"] == "The server isn't answering properly right now (error 500).")
            #expect(model.pendingUndo == nil)
        }

        @Test("should keep the item out of the list and queued for later when the connection is down", arguments: [
            WriteFailureCase.offline,
            WriteFailureCase.signedOut
        ])
        func offlineStaysQueued(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/approve": failure.reply])
            defer { session.end() }

            _ = await model.decide(.approve, bitId: "kb_10")
            await model.settleDecisions()

            #expect(bitIds(model) == ["kb_11"])
            #expect(model.rowMessages["kb_10"] == nil)
            #expect(await model.decisionQueue.count() == 1)
        }

        @Test("should hide an item another device already decided and tell the user")
        func approveAlreadyDecidedElsewhere() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/approve": .json(409, #"{"error":"blocked"}"#)
            ])
            defer { session.end() }

            _ = await model.decide(.approve, bitId: "kb_10")
            await model.settleDecisions()

            #expect(bitIds(model) == ["kb_11"])
            #expect(model.notice == "That item was already decided elsewhere, so it was removed.")
        }

        @Test("should send each ready item of a source as its own approval and leave items without questions alone")
        func bulkApproveSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/approve": .json(200, "{}")])
            defer { session.end() }

            await model.approveAll(sourceId: "src_01")

            #expect(bitIds(model) == ["kb_11"])

            await model.settleDecisions()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/approve"])
            #expect(bitIds(model) == ["kb_11"])
        }

        @Test("should bring back only the items the server refused after a bulk approval")
        func bulkApproveRollsBackPerRow() async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/approve": .json(409, #"{"error":"no_variant"}"#)])
            defer { session.end() }

            await model.approveAll(sourceId: "src_01")
            await model.settleDecisions()

            #expect(bitIds(model) == ["kb_10", "kb_11"])
            #expect(model.rowMessages["kb_10"] == "This item has no questions yet, so it can't be approved.")
        }

        @Test("should restore a rejected item before the rejection is sent without calling the server")
        func undoRejectBeforeSend() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/reject": .held(200, #"{"ok":true,"feedbackId":null}"#),
                "POST /knowledge-bits/kb_11/approve": .json(200, "{}")
            ])
            defer { session.end() }

            _ = await model.decide(.approve, bitId: "kb_11")
            _ = await model.decide(.reject, bitId: "kb_10")
            await model.undoReject()

            #expect(bitIds(model).contains("kb_10"))
            #expect(model.pendingUndo == nil)

            await model.settleDecisions()

            #expect(!FakeServer.writes.map(\.path).contains("/knowledge-bits/kb_10/reject"))
        }

        @Test("should post the restore and put a rejected item back in its place once the rejection was sent")
        func undoRejectSucceeds() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/reject": .json(200, #"{"ok":true,"feedbackId":null}"#),
                "POST /knowledge-bits/kb_10/restore": .json(200, "{}")
            ])
            defer { session.end() }

            _ = await model.decide(.reject, bitId: "kb_10")
            await model.settleDecisions()
            await model.undoReject()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/reject", "/knowledge-bits/kb_10/restore"])
            #expect(bitIds(model) == ["kb_10", "kb_11"])
            #expect(model.pendingUndo == nil)
        }

        @Test("should keep undo available for another try when the connection drops during restore")
        func undoRejectOffline() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/reject": .json(200, #"{"ok":true,"feedbackId":null}"#),
                "POST /knowledge-bits/kb_10/restore": .failure(.networkConnectionLost)
            ])
            defer { session.end() }

            _ = await model.decide(.reject, bitId: "kb_10")
            await model.settleDecisions()
            await model.undoReject()

            #expect(bitIds(model) == ["kb_11"])
            #expect(model.pendingUndo?.canRetry == true)
            #expect(model.pendingUndo?.message == "Couldn't connect to the server. Try Undo again.")
            model.dismissUndo()
        }
    }
}
