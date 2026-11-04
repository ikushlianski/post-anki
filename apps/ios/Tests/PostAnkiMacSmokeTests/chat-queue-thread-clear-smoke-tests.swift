import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review chat clear")
    struct ChatQueueThreadClearSmokeTests {
        private let clearPath = "/knowledge-bits/k1/chat-queue"

        @Test("should clear a review chat without moving it to Inbox and take it off the Chat count")
        func clearsReviewChat() async {
            let session = FakeServerSession(["DELETE \(clearPath)": .json(200, "{}")])
            defer { session.end() }

            let counts = ChatQueueCountStore.shared
            counts.adjust(by: 5 - counts.count)

            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 6, reviewChat: true)
            let model = ChatQueueThreadModel(item: item, counts: counts, drafts: InMemoryChatQueueDraftStore())

            await model.clearChat()

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["DELETE \(clearPath)"])
            #expect(model.isFinished)
            #expect(!model.wasSnoozed)
            #expect(counts.count == 4)
            #expect(model.errorMessage == nil)
        }
    }
}
