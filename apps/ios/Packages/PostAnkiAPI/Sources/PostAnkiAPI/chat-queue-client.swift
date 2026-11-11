import Foundation

extension APIClient {
    public static func listChatQueue() async throws -> ChatQueueList {
        try await request("/knowledge-bits/chat-queue")
    }

    @discardableResult
    public static func moveToChatQueue(id: String, prompt: String? = nil) async throws -> Int {
        let path = "/knowledge-bits/\(encodedSegment(id))/chat-queue"
        let text = prompt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let result: MoveToChatQueueResult = text.isEmpty
            ? try await request(path, method: "POST")
            : try await request(path, method: "POST", body: MoveToChatQueueInput(prompt: text))

        return result.chatCount
    }

    public static func cancelChatQueueThread(id: String) async throws {
        let _: EmptyResponse = try await request("/knowledge-bits/\(encodedSegment(id))/chat-messages", method: "DELETE")
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
        message: String,
        modelId: String? = ChatModelStore.selectedId()
    ) async throws -> ChatQueueReply {
        try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat-messages",
            method: "POST",
            body: SendChatQueueMessageInput(clientMessageId: clientMessageId, message: message, modelId: modelId)
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
