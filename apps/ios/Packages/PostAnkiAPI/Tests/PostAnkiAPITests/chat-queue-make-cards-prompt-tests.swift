import Testing
@testable import PostAnkiAPI

@Suite("Chat make cards prompt")
struct ChatQueueMakeCardsPromptTests {
    @Test("should quote the selected text in the request to the tutor")
    func quotesSelection() throws {
        let message = try #require(ChatQueueMakeCardsPrompt.message(for: "  Actors isolate state.\n"))

        #expect(message.contains("\"\"\"\nActors isolate state.\n\"\"\""))
    }

    @Test("should not send a request when nothing is selected")
    func emptySelection() {
        #expect(ChatQueueMakeCardsPrompt.message(for: " \n ") == nil)
    }

    @Test("should keep the request within the chat message limit for a very long selection")
    func longSelection() throws {
        let message = try #require(ChatQueueMakeCardsPrompt.message(for: String(repeating: "a", count: 5_000)))

        #expect(message.count <= ChatQueueLimits.maxMessageChars)
    }

    @Test("should count emoji by UTF-16 length so the server accepts a long selection")
    func emojiSelection() throws {
        let message = try #require(ChatQueueMakeCardsPrompt.message(for: String(repeating: "😀", count: 2_000)))

        #expect(message.utf16.count <= ChatQueueLimits.maxMessageChars)
    }

    @Test("should approve only the cards still waiting for a decision")
    func pendingOnly() {
        let proposals = [
            ChatQueueProposal(index: 0, kind: .create, front: "a", back: "b", status: .accepted),
            ChatQueueProposal(index: 1, kind: .create, front: "c", back: "d"),
            ChatQueueProposal(index: 2, kind: .create, front: "e", back: "f", status: .rejected),
            ChatQueueProposal(index: 3, kind: .create, front: "g", back: "h"),
        ]

        #expect(ChatQueueMakeCardsPrompt.pendingIndexes(in: proposals) == [1, 3])
    }
}
