import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Pending approval decisions send the right request and keep items on failure")
    struct PendingApprovalWriteSmokeTests {
        private func loadedModel(extra: [String: FakeReply]) async -> (PendingReviewListModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .fixture("pending-review")]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = PendingReviewListModel()

            await model.load()

            return (model, session)
        }

        private func bitIds(_ model: PendingReviewListModel) -> [String] {
            model.sources.flatMap(\.bits).map(\.id)
        }

        @Test("should post the approval for one item and remove it from the list")
        func approveSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/approve": .json(200, "{}")])
            defer { session.end() }

            let outcome = await model.decide(.approve, bitId: "kb_10")

            guard case .removed = outcome else { Issue.record("expected removed, got \(outcome)"); return }

            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/approve"])
            #expect(bitIds(model) == ["kb_11"])
            #expect(model.rowMessages["kb_10"] == nil)
        }

        @Test("should post the rejection, remove the item and offer undo and feedback")
        func rejectSucceeds() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/reject": .json(200, #"{"ok":true,"feedbackId":"fb_01"}"#)
            ])
            defer { session.end() }

            let outcome = await model.decide(.reject, bitId: "kb_10")

            guard case .removed = outcome else { Issue.record("expected removed, got \(outcome)"); return }

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/reject"])
            #expect(bitIds(model) == ["kb_11"])
            #expect(model.pendingUndo?.removed.bit.id == "kb_10")
            #expect(model.pendingFeedback?.feedbackId == "fb_01")
            model.dismissUndo()
        }

        @Test("should keep the item and show a reason when approving fails", arguments: [
            WriteFailureCase(name: "signed out", reply: .status(401), message: "Your access token was rejected. Check Settings."),
            WriteFailureCase(
                name: "no questions yet",
                reply: .json(409, #"{"error":"no_variant"}"#),
                message: "This item has no questions yet, so it can't be approved."
            ),
            WriteFailureCase(
                name: "server error",
                reply: .json(500, "{}"),
                message: "Couldn't approve this item. Try again."
            ),
            WriteFailureCase(
                name: "dropped connection",
                reply: .failure(.notConnectedToInternet),
                message: "You're offline. Nothing was changed, try again when you're back."
            )
        ])
        func approveFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/approve": failure.reply])
            defer { session.end() }

            let outcome = await model.decide(.approve, bitId: "kb_10")

            guard case .kept(let message) = outcome else { Issue.record("expected kept, got \(outcome)"); return }

            #expect(message == failure.message)
            #expect(model.rowMessages["kb_10"] == failure.message)
            #expect(bitIds(model) == ["kb_10", "kb_11"])
            #expect(model.pendingUndo == nil)
            #expect(model.inFlight.isEmpty)
        }

        @Test("should remove an item another device already decided and tell the user")
        func approveAlreadyDecidedElsewhere() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/approve": .json(409, #"{"error":"blocked"}"#)
            ])
            defer { session.end() }

            let outcome = await model.decide(.approve, bitId: "kb_10")

            guard case .removedElsewhere = outcome else { Issue.record("expected removedElsewhere, got \(outcome)"); return }

            #expect(bitIds(model) == ["kb_11"])
            #expect(model.notice == "That item was already decided elsewhere, so it was removed.")
        }

        @Test("should keep the item and show a reason when rejecting fails", arguments: [
            WriteFailureCase(name: "signed out", reply: .status(401), message: "Your access token was rejected. Check Settings."),
            WriteFailureCase(
                name: "dropped connection",
                reply: .failure(.networkConnectionLost),
                message: "You're offline. Nothing was changed, try again when you're back."
            )
        ])
        func rejectFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/kb_10/reject": failure.reply])
            defer { session.end() }

            let outcome = await model.decide(.reject, bitId: "kb_10")

            guard case .kept(let message) = outcome else { Issue.record("expected kept, got \(outcome)"); return }

            #expect(message == failure.message)
            #expect(bitIds(model) == ["kb_10", "kb_11"])
            #expect(model.pendingUndo == nil)
            #expect(model.pendingFeedback == nil)
        }

        @Test("should send only the ready items of a source in one bulk approval and report the count")
        func bulkApproveSucceeds() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/approvals": .json(200, #"{"approved":["kb_10"],"skipped":[]}"#)
            ])
            defer { session.end() }

            await model.approveAll(sourceId: "src_01")

            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/approvals"])
            #expect(FakeServer.writes.first?.bodyObject == ["knowledgeBitIds": ["kb_10"]] as NSDictionary)
            #expect(bitIds(model) == ["kb_11"])
            #expect(model.sourceMessages["src_01"] == "Approved 1.")
            #expect(model.bulkInFlight.isEmpty)
        }

        @Test("should keep every item and explain when a bulk approval fails", arguments: [
            WriteFailureCase(name: "signed out", reply: .status(401), message: "Your access token was rejected. Check Settings."),
            WriteFailureCase(name: "server error", reply: .json(500, "{}"), message: "Couldn't approve these items. Try again."),
            WriteFailureCase(
                name: "dropped connection",
                reply: .failure(.notConnectedToInternet),
                message: "You're offline. Nothing was changed, try again when you're back."
            )
        ])
        func bulkApproveFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["POST /knowledge-bits/approvals": failure.reply])
            defer { session.end() }

            await model.approveAll(sourceId: "src_01")

            #expect(bitIds(model) == ["kb_10", "kb_11"])
            #expect(model.sourceMessages["src_01"] == failure.message)
            #expect(model.inFlight.isEmpty)
        }

        @Test("should post the restore and put a rejected item back in its place")
        func undoRejectSucceeds() async throws {
            let (model, session) = await loadedModel(extra: [
                "POST /knowledge-bits/kb_10/reject": .json(200, #"{"ok":true,"feedbackId":null}"#),
                "POST /knowledge-bits/kb_10/restore": .json(200, "{}")
            ])
            defer { session.end() }

            _ = await model.decide(.reject, bitId: "kb_10")
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
            await model.undoReject()

            #expect(bitIds(model) == ["kb_11"])
            #expect(model.pendingUndo?.canRetry == true)
            #expect(model.pendingUndo?.message == "You're offline. Try Undo again.")
            model.dismissUndo()
        }
    }
}
