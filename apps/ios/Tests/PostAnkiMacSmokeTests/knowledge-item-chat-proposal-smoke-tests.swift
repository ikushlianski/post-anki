import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Item chat offers card proposals")
    struct KnowledgeItemChatProposalSmokeTests {
        private let threadPath = "/knowledge-bits/kb_1/chat-messages"
        private let emptyThread = #"{"messages":[],"turnsLeft":8,"capReached":false}"#
        private let reply = #"{"reply":"Here is a card","replySeq":2,"proposals":[{"index":0,"kind":"create","front":"Q?","back":"A","status":"pending"}],"turnsLeft":7,"capReached":false}"#

        @Test("should route Make a card through the proposal-capable thread and show the proposed card")
        func makeCardShowsProposal() async {
            let session = FakeServerSession([
                "GET \(threadPath)": .json(200, emptyThread),
                "POST \(threadPath)": .json(200, reply)
            ])
            defer { session.end() }

            let model = KnowledgeItemChatModel(knowledgeBitId: "kb_1", bitBody: "body")

            await model.load()
            await model.thread.makeCard()

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["POST \(threadPath)"])
            #expect(model.thread.lines.last?.proposals.first?.front == "Q?")
            #expect(model.thread.lines.last?.proposals.first?.status == .pending)
        }

        @Test("should send typed messages to the proposal-capable thread and keep the transcript for replacement drafting")
        func typedMessageUsesThread() async {
            let session = FakeServerSession([
                "GET \(threadPath)": .json(200, emptyThread),
                "POST \(threadPath)": .json(200, reply)
            ])
            defer { session.end() }

            let model = KnowledgeItemChatModel(knowledgeBitId: "kb_1", bitBody: "body")

            await model.load()
            model.thread.draft = "make a card that explains X"
            await model.send()

            #expect(FakeServer.writes.map(\.path) == [threadPath])
            #expect(model.transcript.map(\.role) == ["user", "assistant"])
        }

        @Test("should accept a proposal in the item chat and leave the chat-queue badge alone")
        func acceptKeepsQueueCount() async {
            let session = FakeServerSession([
                "GET \(threadPath)": .json(200, emptyThread),
                "POST \(threadPath)": .json(200, reply),
                "POST \(threadPath)/2/proposals/0/accept": .json(200, #"{"ok":true,"status":"accepted","savedCardId":"c1"}"#)
            ])
            defer { session.end() }

            let model = KnowledgeItemChatModel(knowledgeBitId: "kb_1", bitBody: "body")

            await model.load()
            await model.thread.makeCard()

            let before = ChatQueueCountStore.shared.count
            let ok = await model.thread.decide(seq: 2, index: 0, decision: .accept)

            #expect(ok)
            #expect(model.thread.lines.last?.proposals.first?.savedCardId == "c1")
            #expect(ChatQueueCountStore.shared.count == before)
        }

        @Test("should not touch the chat-queue badge when the item is gone")
        func missingItemKeepsQueueCount() async {
            let session = FakeServerSession(["GET \(threadPath)": .status(404)])
            defer { session.end() }

            let model = KnowledgeItemChatModel(knowledgeBitId: "kb_1", bitBody: "body")
            let before = ChatQueueCountStore.shared.count

            model.thread.handle(.notFound)

            #expect(ChatQueueCountStore.shared.count == before)
        }
    }
}
