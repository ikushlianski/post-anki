import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat thread actions and proposals never block the next input")
    struct ChatQueueThreadOptimisticSmokeTests {
        private let threadPath = "/knowledge-bits/k1/chat-messages"
        private let notInChat = #"{"error":"not_in_chat"}"#

        private func proposals(_ kinds: [String]) -> String {
            kinds.enumerated().map {
                #"{"index":\#($0.offset),"kind":"\#($0.element)","front":"Q\#($0.offset)","back":"A","status":"pending"}"#
            }.joined(separator: ",")
        }

        private func thread(_ kinds: [String]) -> String {
            #"{"messages":[{"seq":1,"role":"user","text":"fix","createdAt":"t"},{"seq":2,"role":"assistant","text":"ok","createdAt":"t","proposals":[\#(proposals(kinds))]}],"turnsLeft":6,"capReached":false}"#
        }

        private func make(
            _ kinds: [String] = ["create"],
            _ extra: [String: FakeReply] = [:]
        ) async -> (ChatQueueThreadModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["GET \(threadPath)": .json(200, thread(kinds))]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let counts = ChatQueueCountStore.shared

            counts.adjust(by: 5 - counts.count)

            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 6)
            let model = ChatQueueThreadModel(item: item, counts: counts, drafts: InMemoryChatQueueDraftStore())

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        private func decidePath(_ index: Int, _ decision: String) -> String {
            "POST \(threadPath)/2/proposals/\(index)/\(decision)"
        }

        private func accepted(_ card: String) -> String { #"{"ok":true,"status":"accepted","savedCardId":"\#(card)"}"# }

        @Test("should close the chat and lower the count at once on Cancel chat while the request is still held")
        func cancelIsImmediate() async throws {
            let (model, session) = await make([], ["DELETE \(threadPath)": .held(200, "{}")])
            defer { session.end() }

            await model.cancelChat()

            #expect(model.isFinished)
            #expect(!model.isResolving)
            #expect(ChatQueueCountStore.shared.count == 4)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.isFinished)
            #expect(ChatQueueCountStore.shared.count == 4)
            #expect(model.errorMessage == nil)
        }

        @Test("should close the chat at once on Finish chat and Back to triage and send each request in the background")
        func acceptAndReturnAreImmediate() async throws {
            let (model, session) = await make([], ["POST /knowledge-bits/k1/approve": .held(200, "{}")])
            defer { session.end() }

            await model.accept()

            #expect(model.isFinished)
            #expect(ChatQueueCountStore.shared.count == 4)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/k1/approve"])
        }

        @Test("should mark the chat snoozed at once and only tell the list after the snooze request finished")
        func snoozeIsImmediate() async throws {
            let (model, session) = await make([], ["POST /knowledge-bits/k1/chat-queue/snooze": .held(200, #"{"snoozedUntil":"2030-01-01T00:00:00.000Z"}"#)])
            defer { session.end() }

            await model.snooze(days: 3)

            #expect(model.isFinished)
            #expect(model.wasSnoozed)
            #expect(ChatQueueCountStore.shared.count == 5)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.wasSnoozed)
        }

        @Test("should bring the chat back with a plain message and restore the count when the late request fails")
        func lateFailureBringsChatBack() async throws {
            let (model, session) = await make([], ["DELETE /knowledge-bits/k1/chat-queue": .held(500, "{}")])
            defer { session.end() }

            var told: [String] = []

            model.onRolledBack = { id, message in told.append("\(id): \(message)") }
            model.draft = "typed"

            await model.backToTriage()

            #expect(model.isFinished)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(!model.isFinished)
            #expect(ChatQueueCountStore.shared.count == 5)
            #expect(model.errorMessage?.contains("back in the chat queue") == true)
            #expect(told.count == 1)
            #expect(model.draft == "typed")
        }

        @Test("should not reopen the chat when the late failure says it already left the chat")
        func alreadyLeftStaysClosed() async throws {
            let (model, session) = await make([], ["POST /knowledge-bits/k1/approve": .held(409, notInChat)])
            defer { session.end() }

            var told = 0

            model.onRolledBack = { _, _ in told += 1 }

            await model.accept()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.isFinished)
            #expect(ChatQueueCountStore.shared.count == 4)
            #expect(told == 1)
        }

        @Test("should show the reason panel at once on Reject and keep Send reason off until the feedback id arrives")
        func rejectShowsPanelAtOnce() async throws {
            let (model, session) = await make([], [
                "POST /knowledge-bits/k1/reject": .held(200, #"{"ok":true,"feedbackId":"f1"}"#),
                "PATCH /knowledge-bit-feedback/f1": .json(200, "{}")
            ])
            defer { session.end() }

            await model.reject()
            try await waitForHeld(1)

            #expect(model.rejectFeedback != nil)
            #expect(model.rejectFeedbackId == nil)
            #expect(!model.isResolving)
            #expect(ChatQueueCountStore.shared.count == 4)
            #expect(await model.sendRejectReason("wrong_answer", note: "") == nil)
            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(!model.isFinished)

            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.rejectFeedbackId == "f1")

            _ = await model.sendRejectReason("wrong_answer", note: " note ")

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["POST /knowledge-bits/k1/reject", "PATCH /knowledge-bit-feedback/f1"])
            #expect(model.isFinished)
        }

        @Test("should close the reason panel and restore the count when the reject request fails")
        func rejectFailureClosesPanel() async throws {
            let (model, session) = await make([], ["POST /knowledge-bits/k1/reject": .held(500, "{}")])
            defer { session.end() }

            await model.reject()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.rejectFeedback == nil)
            #expect(!model.isFinished)
            #expect(ChatQueueCountStore.shared.count == 5)
            #expect(model.errorMessage != nil)
        }

        @Test("should mark a proposal accepted at once and attach the saved card id when the answer arrives")
        func decideIsImmediate() async throws {
            let (model, session) = await make(["create"], [decidePath(0, "accept"): .held(200, accepted("c1"))])
            defer { session.end() }

            let ok = await model.decide(seq: 2, index: 0, decision: .accept)

            #expect(ok)
            #expect(model.lines.last?.proposals.first?.status == .accepted)
            #expect(model.lines.last?.proposals.first?.savedCardId == nil)
            #expect(!model.isResolving)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.lines.last?.proposals.first?.savedCardId == "c1")
        }

        @Test("should mark every pending proposal at once on Approve all and send them one by one in order")
        func approveAllOrder() async throws {
            let (model, session) = await make(["create", "create", "create"], [
                decidePath(0, "accept"): .held(200, accepted("c0")),
                decidePath(1, "accept"): .json(200, accepted("c1")),
                decidePath(2, "accept"): .json(200, accepted("c2"))
            ])
            defer { session.end() }

            await model.approveAll(seq: 2)

            #expect(model.lines.last?.proposals.map(\.status) == [.accepted, .accepted, .accepted])

            try await waitForHeld(1)

            #expect(FakeServer.writes.count == 1)

            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(FakeServer.writes.map(\.path) == (0...2).map { "\(threadPath)/2/proposals/\($0)/accept" })
            #expect(model.lines.last?.proposals.compactMap(\.savedCardId) == ["c0", "c1", "c2"])
        }

        @Test("should put back only the proposal whose late request failed")
        func lateDecisionFailureRestoresOnlyThatProposal() async {
            let (model, session) = await make(["create", "create"], [
                decidePath(0, "accept"): .json(200, accepted("c0")),
                decidePath(1, "accept"): .status(500)
            ])
            defer { session.end() }

            await model.approveAll(seq: 2)
            await model.settleWrites()

            #expect(model.lines.last?.proposals.map(\.status) == [.accepted, .pending])
            #expect(model.proposalErrors[ChatQueueProposalKey(seq: 2, index: 1)] != nil)
            #expect(model.proposalErrors[ChatQueueProposalKey(seq: 2, index: 0)] == nil)
        }

        @Test("should reload the thread when the server says the proposal was already decided")
        func notPendingReloads() async {
            let decided = thread(["create"]).replacingOccurrences(of: #""status":"pending""#, with: #""status":"accepted""#)
            let (model, session) = await make(["create"], [
                "GET \(threadPath)": .sequence([.json(200, thread(["create"])), .json(200, decided)]),
                decidePath(0, "reject"): .json(409, #"{"error":"proposal_not_pending"}"#)
            ])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .reject, announcesRejection: false)
            await model.settleWrites()

            #expect(FakeServer.requests.filter { $0.method == "GET" }.count == 2)
            #expect(model.lines.last?.proposals.first?.status == .accepted)
        }

        @Test("should update the card header at once for an accepted update and put it back when the request fails")
        func updateRollsBack() async throws {
            let (model, session) = await make(["update"], [decidePath(0, "accept"): .held(500, "{}")])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .accept)

            #expect(model.item.body == "Q0\nA")

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.item.body == "Card")
            #expect(model.lines.last?.proposals.first?.status == .pending)
        }

        @Test("should leave the chat and not restore the proposal when the late decision says the card left the chat")
        func decisionAlreadyLeft() async throws {
            let (model, session) = await make(["create"], [decidePath(0, "accept"): .held(409, notInChat)])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .accept)
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settleWrites()

            #expect(model.isFinished)
            #expect(model.lines.last?.proposals.first?.status == .accepted)
        }

        @Test("should not send the rejection message when the reject decision failed and the proposal went back to pending")
        func failedRejectSendsNoMessage() async {
            let (model, session) = await make(["create"], [decidePath(0, "reject"): .status(500)])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .reject)
            await model.rejectAnnouncement?.value
            await model.settleWrites()

            #expect(model.lines.last?.proposals.first?.status == .pending)
            #expect(FakeServer.writes.map(\.path) == ["\(threadPath)/2/proposals/0/reject"])
            #expect(!model.lines.contains { $0.isUser && $0.text.contains("rejected") })
            #expect(!model.awaitsRejectExplanation)
        }
    }
}
