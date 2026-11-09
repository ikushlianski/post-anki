import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat thread proposal reword and make a card")
    struct ChatQueueProposalRewordSmokeTests {
        private let threadPath = "/knowledge-bits/k1/chat-messages"
        private let proposalPath = "/knowledge-bits/k1/chat-messages/2/proposals/0"
        private let thread = #"{"messages":[{"seq":1,"role":"user","text":"Make a card","createdAt":"t"},{"seq":2,"role":"assistant","text":"Here","createdAt":"t","proposals":[{"index":0,"kind":"create","front":"Q?","back":"A","status":"pending"}]}],"turnsLeft":6,"capReached":false}"#

        private func make(_ extra: [String: FakeReply] = [:]) async -> (ChatQueueThreadModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["GET \(threadPath)": .json(200, thread)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 6)
            let model = ChatQueueThreadModel(item: item, counts: .shared, drafts: InMemoryChatQueueDraftStore())

            await model.load()

            return (model, session)
        }

        @Test("should replace only the question when the learner asks for a new wording and keep it pending")
        func rewordsFrontOnly() async {
            let (model, session) = await make([
                "POST \(proposalPath)/reword": .json(200, #"{"ok":true,"proposal":{"index":0,"kind":"create","front":"Which letter comes first?","back":"A","status":"pending"}}"#)
            ])
            defer { session.end() }

            let ok = await model.reword(seq: 2, index: 0)
            let proposal = model.lines.last?.proposals.first

            #expect(ok)
            #expect(proposal?.front == "Which letter comes first?")
            #expect(proposal?.back == "A")
            #expect(proposal?.status == .pending)
            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["POST \(proposalPath)/reword"])
        }

        @Test("should keep the old question and show an error when rewording fails")
        func rewordFailureKeepsCard() async {
            let (model, session) = await make(["POST \(proposalPath)/reword": .status(502)])
            defer { session.end() }

            let ok = await model.reword(seq: 2, index: 0)

            #expect(!ok)
            #expect(model.lines.last?.proposals.first?.front == "Q?")
            #expect(model.proposalErrors[ChatQueueProposalKey(seq: 2, index: 0)] != nil)
        }

        @Test("should send the make a card request as a normal chat message")
        func makeCardSendsMessage() async {
            let (model, session) = await make([
                "POST \(threadPath)": .json(200, #"{"reply":"Proposed","replySeq":4,"proposals":[{"index":0,"kind":"create","front":"Q2","back":"A2","status":"pending"}],"turnsLeft":5,"capReached":false}"#)
            ])
            defer { session.end() }

            await model.makeCard()

            #expect(FakeServer.writes.map(\.path) == [threadPath])
            #expect(model.lines.last?.proposals.first?.status == .pending)
            #expect(model.lines.contains { $0.isUser && $0.text == ChatQueueThreadModel.makeCardRequest })
        }
    }
}
