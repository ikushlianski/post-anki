import Testing
@testable import PostAnkiAPI

@Suite("Chat retry draft")
struct ChatQueueRetryDraftTests {
    @Test("should put the lost question back alone when nothing was typed meanwhile")
    func emptyDraft() {
        #expect(ChatQueueRetryDraft.restoring(question: "Why?", over: "") == "Why?")
        #expect(ChatQueueRetryDraft.restoring(question: "Why?", over: "  \n") == "Why?")
    }

    @Test("should keep the question above a typed draft with a blank line between")
    func typedDraft() {
        #expect(ChatQueueRetryDraft.restoring(question: "Why?", over: "And how?") == "Why?\n\nAnd how?")
    }
}
