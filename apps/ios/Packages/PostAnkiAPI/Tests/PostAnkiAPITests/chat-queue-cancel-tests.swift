import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Cancel chat contract")
    struct ChatQueueCancelTests {
        @Test("should delete the whole conversation through the chat messages path")
        func cancelsThread() async throws {
            RecordingStub.install(body: Data(#"{"ok":true}"#.utf8))

            try await APIClient.cancelChatQueueThread(id: "k1")

            let request = try #require(RecordingStub.last)

            #expect(request.method == "DELETE")
            #expect(request.path == "/knowledge-bits/k1/chat-messages")
        }
    }
}
