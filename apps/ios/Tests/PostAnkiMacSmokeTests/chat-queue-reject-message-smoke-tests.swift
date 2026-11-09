import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat thread reject message")
    struct ChatQueueRejectMessageSmokeTests {
        private let threadPath = "/knowledge-bits/k1/chat-messages"
        private let decidePath = "/knowledge-bits/k1/chat-messages/2/proposals/0"
        private let rejected = #"{"ok":true,"status":"rejected"}"#
        private let thread = #"{"messages":[{"seq":1,"role":"user","text":"Fix it","createdAt":"t"},{"seq":2,"role":"assistant","text":"Here","createdAt":"t","proposals":[{"index":0,"kind":"update","front":"Q?","back":"A","status":"pending"}]}],"turnsLeft":6,"capReached":false}"#
        private let reply = #"{"reply":"Better","replySeq":4,"turnsLeft":5,"capReached":false}"#

        private func make(_ extra: [String: FakeReply]) async -> (ChatQueueThreadModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["GET \(threadPath)": .json(200, thread), "POST \(decidePath)/reject": .json(200, rejected)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 6)
            let model = ChatQueueThreadModel(item: item, counts: .shared, drafts: InMemoryChatQueueDraftStore())

            await model.load()

            return (model, session)
        }

        private func sends() -> [NSDictionary] {
            FakeServer.writes.filter { $0.path == threadPath }.compactMap(\.bodyObject)
        }

        @Test("should send one deterministic rejection message and not repeat it on a second reject")
        func sendsOnce() async {
            let (model, session) = await make(["POST \(threadPath)": .json(200, reply)])
            defer { session.end() }

            await model.decide(seq: 2, index: 0, decision: .reject)
            await model.rejectAnnouncement?.value
            await model.decide(seq: 2, index: 0, decision: .reject)
            await model.rejectAnnouncement?.value

            #expect(sends().count == 1)
            #expect(sends().first?["clientMessageId"] as? String == "reject:k1:2:0")
            #expect(sends().first?["message"] as? String == "I rejected your proposed card: Q?.")
            #expect(!model.awaitsRejectExplanation)
        }

        @Test("should finish the decision before the agent reply arrives and still send once")
        func decisionDoesNotWaitForReply() async {
            let (model, session) = await make(["POST \(threadPath)": .json(200, reply)])
            defer { session.end() }

            let ok = await model.decide(seq: 2, index: 0, decision: .reject)

            #expect(ok)
            #expect(model.decidingProposals.isEmpty)
            #expect(model.lines.last?.seq == 2)

            await model.rejectAnnouncement?.value

            #expect(sends().count == 1)
            #expect(model.lines.last?.seq == 4)
        }

        @Test("should queue the rejection message behind a running reply and send it afterwards")
        func queuesWhileReplying() async {
            let (model, session) = await make(["POST \(threadPath)": .json(200, reply)])
            defer { session.end() }

            model.isSending = true
            await model.decide(seq: 2, index: 0, decision: .reject)
            await model.rejectAnnouncement?.value

            #expect(model.followUps.items.map(\.id) == ["reject:k1:2:0"])
            #expect(sends().isEmpty)

            model.isSending = false
            await model.send("Next")
            #expect(sends().compactMap { $0["clientMessageId"] as? String }.contains("reject:k1:2:0"))
        }

        @Test("should send nothing and fall back to the composer hint when the chat is capped")
        func cappedFallsBack() async {
            let (model, session) = await make([:])
            defer { session.end() }

            model.capReached = true
            await model.decide(seq: 2, index: 0, decision: .reject)
            await model.rejectAnnouncement?.value

            #expect(sends().isEmpty)
            #expect(model.awaitsRejectExplanation)
            #expect(model.composerFocusRequests == 1)
        }

        @Test("should send nothing and show the composer hint when the budget is paused")
        func pausedFallsBack() async {
            let (model, session) = await make([:])
            defer { session.end() }

            model.budgetPaused = true
            await model.decide(seq: 2, index: 0, decision: .reject)
            await model.rejectAnnouncement?.value

            #expect(sends().isEmpty)
            #expect(model.awaitsRejectExplanation)
        }
    }
}
