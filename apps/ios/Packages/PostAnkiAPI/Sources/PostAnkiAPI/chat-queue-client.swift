import Foundation

extension APIClient {
    public static func listChatQueue() async throws -> ChatQueueList {
        try await request("/knowledge-bits/chat-queue")
    }

    @discardableResult
    public static func moveToChatQueue(id: String) async throws -> Int {
        let result: MoveToChatQueueResult = try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat-queue",
            method: "POST"
        )

        return result.chatCount
    }

    public static func returnFromChatQueue(id: String) async throws {
        let _: EmptyResponse = try await request("/knowledge-bits/\(encodedSegment(id))/chat-queue", method: "DELETE")
    }

    @discardableResult
    public static func snoozeChatQueue(id: String, days: Int) async throws -> Date? {
        let result: SnoozeChatQueueResult = try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat-queue/snooze",
            method: "POST",
            body: SnoozeChatQueueInput(days: days)
        )

        return result.snoozedUntil.flatMap(ChatQueueDate.parse)
    }

    public static func unsnoozeChatQueue(id: String) async throws {
        let _: EmptyResponse = try await request("/knowledge-bits/\(encodedSegment(id))/chat-queue/snooze", method: "DELETE")
    }

    public static func chatQueueThread(id: String) async throws -> ChatQueueThread {
        try await request("/knowledge-bits/\(encodedSegment(id))/chat-messages")
    }

    @discardableResult
    public static func deleteLastChatQueueExchange(id: String) async throws -> DeleteLastChatExchangeResult {
        try await request("/knowledge-bits/\(encodedSegment(id))/chat-queue/messages/last", method: "DELETE")
    }

    public static func sendChatQueueMessage(
        id: String,
        clientMessageId: String,
        message: String
    ) async throws -> ChatQueueReply {
        try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat-messages",
            method: "POST",
            body: SendChatQueueMessageInput(clientMessageId: clientMessageId, message: message)
        )
    }
}

extension APIClient {
    public static func decideChatQueueProposal(
        id: String,
        seq: Int,
        index: Int,
        decision: ChatQueueProposalDecision
    ) async throws -> ChatQueueProposalDecisionResult {
        try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat-messages/\(seq)/proposals/\(index)/\(decision.pathComponent)",
            method: "POST"
        )
    }

    public static func rewordChatQueueProposal(id: String, seq: Int, index: Int) async throws -> ChatQueueProposal {
        let result: ChatQueueProposalRewordResult = try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat-messages/\(seq)/proposals/\(index)/reword",
            method: "POST"
        )

        return result.proposal
    }
}
