import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Chat queue proposals")
    struct ChatQueueProposalTests {
        private let proposalJSON = #"{"index":0,"kind":"update","front":"Q?","back":"A","example":"e.g.","reason":"clearer","status":"pending"}"#

        @Test("should read the proposals the tutor attached to a reply with the reply number")
        func decodesReplyProposals() throws {
            let json = Data(#"{"reply":"Try this","replySeq":4,"proposals":[\#(proposalJSON)],"turnsLeft":5,"capReached":false}"#.utf8)
            let reply = try JSONDecoder().decode(ChatQueueReply.self, from: json)
            let proposal = try #require(reply.proposals.first)

            #expect(reply.replySeq == 4)
            #expect(proposal.kind == .update)
            #expect(proposal.kind.label == "Update to this card")
            #expect(proposal.status == .pending)
            #expect(proposal.example == "e.g.")
            #expect(proposal.reason == "clearer")
        }

        @Test("should show saved proposals again with their decided state when the thread is reloaded")
        func decodesThreadProposals() throws {
            let json = Data(#"{"messages":[{"seq":2,"role":"assistant","text":"x","createdAt":"t","proposals":[{"index":1,"kind":"create","front":"Q","back":"A","status":"accepted","savedCardId":"kb_9"}]}],"turnsLeft":5,"capReached":false}"#.utf8)
            let thread = try JSONDecoder().decode(ChatQueueThread.self, from: json)
            let proposal = try #require(thread.messages.first?.proposals.first)

            #expect(proposal.status == .accepted)
            #expect(proposal.savedCardId == "kb_9")
            #expect(proposal.kind.label == "New card")
        }

        @Test("should skip a proposal it cannot read and keep the message and the others")
        func toleratesBrokenProposal() throws {
            let json = Data(#"{"messages":[{"seq":2,"role":"assistant","text":"x","createdAt":"t","proposals":[{"index":0,"kind":"mystery","front":"Q","back":"A","status":"pending"},\#(proposalJSON)]}],"turnsLeft":5,"capReached":false}"#.utf8)
            let message = try #require(JSONDecoder().decode(ChatQueueThread.self, from: json).messages.first)

            #expect(message.text == "x")
            #expect(message.proposals.count == 1)
        }

        @Test("should read a message without proposals as having none")
        func missingProposals() throws {
            let json = Data(#"{"seq":1,"role":"user","text":"x","createdAt":"t"}"#.utf8)

            #expect(try JSONDecoder().decode(ChatQueueMessage.self, from: json).proposals.isEmpty)
        }

        @Test("should accept a proposal with one POST to its accept path and no body")
        func acceptsProposal() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"status":"accepted","savedCardId":"kb_9"}"#.utf8))

            let result = try await APIClient.decideChatQueueProposal(id: "kb/1", seq: 4, index: 1, decision: .accept)
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb%2F1/chat-messages/4/proposals/1/accept")
            #expect(request.body == nil)
            #expect(result.status == .accepted)
            #expect(result.savedCardId == "kb_9")
        }

        @Test("should reject a proposal with a POST to its reject path")
        func rejectsProposal() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"status":"rejected"}"#.utf8))

            let result = try await APIClient.decideChatQueueProposal(id: "kb_1", seq: 2, index: 0, decision: .reject)
            let request = try #require(RecordingStub.last)

            #expect(request.path == "/knowledge-bits/kb_1/chat-messages/2/proposals/0/reject")
            #expect(result.status == .rejected)
            #expect(result.savedCardId == nil)
        }

        @Test("should treat a swipe right as accept and a swipe left as reject")
        func mapsSwipes() {
            #expect(ChatQueueProposalDecision(swipe: .approve) == .accept)
            #expect(ChatQueueProposalDecision(swipe: .reject) == .reject)
        }

        @Test("should map decision errors to messages the thread can show", arguments: [
            (409, "proposal_not_pending", ChatQueueFailure.proposalNotPending),
            (409, "not_in_chat", .notInChat),
            (422, "wrong_shape", .wrongShape),
            (404, "not_found", .notFound)
        ])
        func mapsFailures(status: Int, code: String, expected: ChatQueueFailure) async {
            RecordingStub.install(status: status, body: Data(#"{"error":"\#(code)"}"#.utf8))

            do {
                _ = try await APIClient.decideChatQueueProposal(id: "kb_1", seq: 2, index: 0, decision: .accept)
                Issue.record("expected a failure")
            } catch {
                #expect(ChatQueueFailure.failure(for: error) == expected)
            }
        }
    }
}
