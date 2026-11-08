import CoreGraphics
import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat thread card proposals")
    struct ChatQueueProposalSmokeTests {
        private let threadPath = "/knowledge-bits/k1/chat-messages"
        private let decidePath = "/knowledge-bits/k1/chat-messages/2/proposals/0"
        private let thread = #"{"messages":[{"seq":1,"role":"user","text":"Fix it","createdAt":"t"},{"seq":2,"role":"assistant","text":"Here","createdAt":"t","proposals":[{"index":0,"kind":"update","front":"Q?","back":"A","status":"pending"}]}],"turnsLeft":6,"capReached":false}"#
        private let reply = #"{"reply":"Better","replySeq":4,"proposals":[{"index":0,"kind":"create","front":"Q2","back":"A2","status":"pending"}],"turnsLeft":5,"capReached":false}"#

        private func make(_ extra: [String: FakeReply] = [:]) async -> (ChatQueueThreadModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["GET \(threadPath)": .json(200, thread)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 6)
            let model = ChatQueueThreadModel(item: item, counts: .shared, drafts: InMemoryChatQueueDraftStore())

            await model.load()

            return (model, session)
        }

        @Test("should show a stored proposal as pending after reload and save nothing without a gesture")
        func loadsPendingWithoutSaving() async {
            let (model, session) = await make()
            defer { session.end() }

            #expect(model.lines.last?.proposals.first?.status == .pending)
            #expect(FakeServer.writes.isEmpty)
        }

        @Test("should call accept exactly once and mark the proposal accepted")
        func acceptsOnce() async {
            let (model, session) = await make(["POST \(decidePath)/accept": .json(200, #"{"ok":true,"status":"accepted","savedCardId":"c1"}"#)])
            defer { session.end() }

            async let first = model.decide(seq: 2, index: 0, decision: .accept)
            async let second = model.decide(seq: 2, index: 0, decision: .accept)
            _ = await (first, second)
            _ = await model.decide(seq: 2, index: 0, decision: .accept)

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["POST \(decidePath)/accept"])
            #expect(model.lines.last?.proposals.first?.status == .accepted)
            #expect(model.lines.last?.proposals.first?.savedCardId == "c1")
        }

        @Test("should keep the thread open on reject, ask what is wrong and let the next message continue it")
        func rejectKeepsThread() async {
            let (model, session) = await make([
                "POST \(decidePath)/reject": .json(200, #"{"ok":true,"status":"rejected"}"#),
                "POST \(threadPath)": .json(200, reply)
            ])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .reject)

            #expect(model.lines.last?.proposals.first?.status == .rejected)
            #expect(model.awaitsRejectExplanation)
            #expect(model.composerFocusRequests == 1)
            #expect(!model.isFinished)
            #expect(model.canSendAfter("Too vague"))

            await model.send("Too vague")

            #expect(model.lines.last?.seq == 4)
            #expect(model.lines.last?.proposals.first?.front == "Q2")
            #expect(!model.awaitsRejectExplanation)
            #expect(FakeServer.writes.map(\.path) == ["\(decidePath)/reject", threadPath])
        }

        @Test("should keep the proposal pending and show the error when the decision fails")
        func failureKeepsPending() async {
            let (model, session) = await make(["POST \(decidePath)/accept": .status(500)])
            defer { session.end() }

            let ok = await model.decide(seq: 2, index: 0, decision: .accept)

            #expect(!ok)
            #expect(model.lines.last?.proposals.first?.status == .pending)
            #expect(model.proposalErrors[ChatQueueProposalKey(seq: 2, index: 0)] != nil)
            #expect(model.decidingProposals.isEmpty)
        }

        @Test("should map swipe distance to accept on the right, reject on the left and nothing for a small drag on touch")
        func swipeMapping() {
            #expect(ChatQueueProposalSwipe.decision(width: 80, predictedWidth: 80, isMac: false) == .accept)
            #expect(ChatQueueProposalSwipe.decision(width: -80, predictedWidth: -80, isMac: false) == .reject)
            #expect(ChatQueueProposalSwipe.decision(width: 20, predictedWidth: 20, isMac: false) == nil)
            #expect(ChatQueueProposalSwipe.isHorizontal(CGSize(width: 50, height: 10)))
            #expect(!ChatQueueProposalSwipe.isHorizontal(CGSize(width: 10, height: 50)))
        }

        @Test("should not save or discard a card on a short mouse drag or fling on the Mac")
        func macNeedsLongDrag() {
            #expect(ChatQueueProposalSwipe.decision(width: 80, predictedWidth: 80, isMac: true) == nil)
            #expect(ChatQueueProposalSwipe.decision(width: 30, predictedWidth: 600, isMac: true) == nil)
            #expect(ChatQueueProposalSwipe.decision(width: -119, predictedWidth: -119, isMac: true) == nil)
            #expect(ChatQueueProposalSwipe.decision(width: 120, predictedWidth: 120, isMac: true) == .accept)
            #expect(ChatQueueProposalSwipe.decision(width: -120, predictedWidth: -120, isMac: true) == .reject)
        }

        @Test("should refresh the card header when an update proposal is accepted but not for a new card or a reject")
        func acceptedUpdateRefreshesHeader() async {
            let (model, session) = await make(["POST \(decidePath)/accept": .json(200, #"{"ok":true,"status":"accepted"}"#)])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .accept)

            #expect(model.item.body == "Q?\nA")
        }

        @Test("should leave the header alone when the update is rejected")
        func rejectedUpdateKeepsHeader() async {
            let (model, session) = await make(["POST \(decidePath)/reject": .json(200, #"{"ok":true,"status":"rejected"}"#)])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .reject)

            #expect(model.item.body == "Card")
        }

        @Test("should give two proposals different spoken labels and speak the decided and error states")
        func distinctLabels() {
            let update = ChatQueueProposal(index: 0, kind: .update, front: "Q1", back: "A")
            let create = ChatQueueProposal(index: 1, kind: .create, front: "Q2", back: "A", status: .accepted)

            let first = ChatQueueProposalAccessibility.label(update, isBusy: false, errorMessage: nil)
            let second = ChatQueueProposalAccessibility.label(create, isBusy: false, errorMessage: "Nope")

            #expect(first != second)
            #expect(first.contains("Update to this card") && first.contains("Q1"))
            #expect(second.contains("New card") && second.contains("Card added to review") && second.contains("Nope"))
            #expect(ChatQueueProposalAccessibility.actionName("Accept", update) != ChatQueueProposalAccessibility.actionName("Accept", create))
        }

        @Test("should forget the pending reject explanation once the last exchange is deleted")
        func deleteClearsRejectExplanation() async {
            let (model, session) = await make([
                "POST \(decidePath)/reject": .json(200, #"{"ok":true,"status":"rejected"}"#),
                "DELETE /knowledge-bits/k1/chat-queue/messages/last": .json(200, #"{"ok":true,"turnsLeft":6,"capReached":false}"#)
            ])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .reject)
            #expect(model.awaitsRejectExplanation)

            await model.deleteLastExchange()

            #expect(!model.awaitsRejectExplanation)
        }
    }
}

private extension ChatQueueThreadModel {
    func canSendAfter(_ text: String) -> Bool {
        draft = text

        return canSend
    }
}
