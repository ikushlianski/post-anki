import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Mac triage Send to chat")
    struct MacTriageSendToChatSmokeTests {
        private let moved = #"{"ok":true,"chatCount":2}"#
        private let path = "/knowledge-bits/a/chat-queue"

        private func make(reply: FakeReply) async -> (PendingReviewTriageModel, FakeServerSession) {
            let bits = ["a", "b"].map { FocusTriageFixtures.bit($0) }
            let list = FocusTriageFixtures.list([FocusTriageFixtures.source("s1", bits: bits)])
            let session = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, list),
                "POST \(path)": reply
            ])
            let model = PendingReviewTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.list.load()

            return (model, session)
        }

        @Test("should move to the next card, record no decision and raise the Chat count")
        func movesToNextCard() async {
            let (model, session) = await make(reply: .json(200, moved))
            defer { session.end() }

            let chat = ChatQueueCountStore.shared
            let before = chat.count

            #expect(await model.sendToChat())
            #expect(model.current?.id == "b")
            #expect(model.queue.count == 1)
            #expect(chat.count == before + 1)
            #expect(model.queued.isEmpty)
            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["POST \(path)"])
            #expect(FakeServer.writes.first?.body == nil)
        }

        @Test("should send the first prompt with the move")
        func sendsPrompt() async {
            let (model, session) = await make(reply: .json(200, moved))
            defer { session.end() }

            #expect(await model.sendToChat(prompt: "Why this?"))
            #expect(FakeServer.writes.first?.bodyObject?["prompt"] as? String == "Why this?")
        }

        @Test("should remove a card that was decided elsewhere and say so")
        func blockedRemovesWithNotice() async {
            let (model, session) = await make(reply: .json(409, #"{"error":"blocked"}"#))
            defer { session.end() }

            #expect(!(await model.sendToChat()))
            #expect(model.current?.id == "b")
            #expect(model.list.notice != nil)
        }

        @Test("should keep the card with a message when the move fails offline")
        func failureKeepsCard() async {
            let (model, session) = await make(reply: .failure(.notConnectedToInternet))
            defer { session.end() }

            #expect(!(await model.sendToChat()))
            #expect(model.current?.id == "a")
            #expect(model.message != nil)
        }
    }
}
