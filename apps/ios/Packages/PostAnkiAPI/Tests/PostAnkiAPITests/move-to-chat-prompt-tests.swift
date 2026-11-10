import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Send to chat with a first prompt")
    struct MoveToChatPromptTests {
        @Test("should send the trimmed prompt as the request body")
        func sendsPrompt() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"chatCount":3}"#.utf8))

            let count = try await APIClient.moveToChatQueue(id: "k1", prompt: "  Why this?  ")
            let request = try #require(RecordingStub.last)

            #expect(count == 3)
            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/k1/chat-queue")
            #expect(request.body?["prompt"] as? String == "Why this?")
        }

        @Test("should send no body when the prompt is empty or missing")
        func sendsNoBodyWithoutPrompt() async throws {
            for prompt in [nil, "", "   \n"] as [String?] {
                RecordingStub.install(body: Data(#"{"ok":true,"chatCount":1}"#.utf8))

                _ = try await APIClient.moveToChatQueue(id: "k1", prompt: prompt)

                #expect(RecordingStub.last?.body == nil)
            }
        }

        @Test("should read the prompt still waiting for its reply from the thread")
        func decodesPendingPrompt() throws {
            let json = Data(#"{"messages":[],"turnsLeft":8,"capReached":false,"pendingPrompt":"Why?"}"#.utf8)
            let thread = try JSONDecoder().decode(ChatQueueThread.self, from: json)

            #expect(thread.pendingPrompt == "Why?")
        }

        @Test("should treat a thread without pendingPrompt as having none")
        func decodesNoPendingPrompt() throws {
            let json = Data(#"{"messages":[],"turnsLeft":8,"capReached":false}"#.utf8)

            #expect(try JSONDecoder().decode(ChatQueueThread.self, from: json).pendingPrompt == nil)
        }
    }
}
