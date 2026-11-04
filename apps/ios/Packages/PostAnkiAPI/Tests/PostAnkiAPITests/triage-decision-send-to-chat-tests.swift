import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Triage decision send to Chat")
    struct TriageDecisionSendToChatTests {
        @Test("should restore a rejected card and then queue it for Chat")
        func restoresThenQueues() async throws {
            RecordingStub.install(body: Data(#"{"chatCount":3}"#.utf8))

            let sent = await APIClient.sendTriageDecisionToChat(id: "kb1", wasRejected: true)

            #expect(sent)
            #expect(RecordingStub.last?.path == "/knowledge-bits/kb1/chat-queue")
            #expect(RecordingStub.last?.method == "POST")
        }

        @Test("should queue an inbox card for Chat without restoring it")
        func queuesInboxCardDirectly() async throws {
            RecordingStub.install(body: Data(#"{"chatCount":1}"#.utf8))

            let sent = await APIClient.sendTriageDecisionToChat(id: "kb2", wasRejected: false)

            #expect(sent)
            #expect(RecordingStub.last?.path == "/knowledge-bits/kb2/chat-queue")
        }

        @Test("should report failure when the server refuses so the row can show an error")
        func reportsFailure() async throws {
            RecordingStub.install(status: 500, body: Data("{}".utf8))

            let sent = await APIClient.sendTriageDecisionToChat(id: "kb3", wasRejected: true)

            #expect(!sent)
        }
    }
}
