import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat Finish and Cancel")
    struct ChatQueueFinishCancelSmokeTests {
        private let threadPath = "/knowledge-bits/k1/chat-messages"

        private func thread(status: String?) -> String {
            let proposal = status.map {
                #","proposals":[{"index":0,"kind":"create","front":"Q","back":"A","status":"\#($0)"}]"#
            } ?? ""

            return #"{"messages":[{"seq":1,"role":"user","text":"make a card","createdAt":"t"},{"seq":2,"role":"assistant","text":"ok","createdAt":"t"\#(proposal)}],"turnsLeft":6,"capReached":false}"#
        }

        private func make(status: String?, extra: [String: FakeReply] = [:]) async -> (ChatQueueThreadModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["GET \(threadPath)": .json(200, thread(status: status))]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 6)
            let model = ChatQueueThreadModel(item: item, counts: .shared, drafts: InMemoryChatQueueDraftStore())

            await model.load()

            return (model, session)
        }

        @Test("should offer Cancel when no proposal was accepted")
        func cancelWithoutAcceptedCard() async {
            for status in [nil, "pending", "rejected"] as [String?] {
                let (model, session) = await make(status: status)

                #expect(!model.hasAcceptedCard)
                session.end()
            }
        }

        @Test("should offer Finish once a proposal was accepted")
        func finishWithAcceptedCard() async {
            let (model, session) = await make(status: "accepted")
            defer { session.end() }

            #expect(model.hasAcceptedCard)
        }

        @Test("should delete the conversation and leave on Cancel chat")
        func cancelDeletes() async {
            let (model, session) = await make(status: nil, extra: ["DELETE \(threadPath)": .json(200, #"{"ok":true}"#)])
            defer { session.end() }

            await model.cancelChat()

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["DELETE \(threadPath)"])
            #expect(model.isFinished)
        }

        @Test("should approve the card on Finish chat without deleting the thread")
        func finishApproves() async {
            let (model, session) = await make(status: "accepted", extra: ["POST /knowledge-bits/k1/approve": .json(200, #"{"ok":true}"#)])
            defer { session.end() }

            await model.accept()

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["POST /knowledge-bits/k1/approve"])
            #expect(model.isFinished)
        }

        @Test("should stay in the chat with a message when Cancel chat fails")
        func cancelFailureStays() async {
            let (model, session) = await make(status: nil, extra: ["DELETE \(threadPath)": .failure(.notConnectedToInternet)])
            defer { session.end() }

            await model.cancelChat()

            #expect(!model.isFinished)
            #expect(model.errorMessage != nil)
        }
    }
}
