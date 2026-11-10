import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat first reply in the background")
    struct ChatQueueFirstReplySmokeTests {
        private let threadPath = "/knowledge-bits/k1/chat-messages"
        private let waiting = #"{"messages":[],"turnsLeft":8,"capReached":false,"pendingPrompt":"Why this?"}"#
        private let answered = #"{"messages":[{"seq":1,"role":"user","text":"Why this?","createdAt":"t"},{"seq":2,"role":"assistant","text":"Because.","createdAt":"t"}],"turnsLeft":7,"capReached":false}"#

        private func model() -> ChatQueueThreadModel {
            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 8)
            let model = ChatQueueThreadModel(item: item, counts: .shared, drafts: InMemoryChatQueueDraftStore())

            model.firstReplyPollDelay = .milliseconds(1)

            return model
        }

        @Test("should show the reply once the server has stored it")
        func showsReplyWhenReady() async {
            let session = FakeServerSession(["GET \(threadPath)": .sequence([.json(200, waiting), .json(200, waiting), .json(200, answered)])])
            defer { session.end() }

            let model = model()

            await model.load()

            #expect(model.lines.map(\.text) == ["Why this?", "Because."])
            #expect(!model.awaitsFirstReply)
            #expect(model.turnsLeft == 7)
        }

        @Test("should put the prompt back in the composer when no reply arrives")
        func timeoutRestoresPrompt() async {
            let session = FakeServerSession(["GET \(threadPath)": .json(200, waiting)])
            defer { session.end() }

            let model = model()

            await model.load()

            #expect(model.lines.isEmpty)
            #expect(model.draft == "Why this?")
            #expect(model.noticeMessage != nil)
            #expect(!model.awaitsFirstReply)
        }

        @Test("should stop waiting when the prompt was cleared without a reply")
        func clearedPromptStopsWaiting() async {
            let cleared = #"{"messages":[],"turnsLeft":8,"capReached":false}"#
            let session = FakeServerSession(["GET \(threadPath)": .sequence([.json(200, waiting), .json(200, cleared)])])
            defer { session.end() }

            let model = model()

            await model.load()

            #expect(model.lines.isEmpty)
            #expect(!model.awaitsFirstReply)
        }

        @Test("should show an ordinary thread without waiting")
        func ordinaryThread() async {
            let session = FakeServerSession(["GET \(threadPath)": .json(200, answered)])
            defer { session.end() }

            let model = model()

            await model.load()

            #expect(model.lines.count == 2)
            #expect(FakeServer.requested.count == 1)
        }
    }
}
