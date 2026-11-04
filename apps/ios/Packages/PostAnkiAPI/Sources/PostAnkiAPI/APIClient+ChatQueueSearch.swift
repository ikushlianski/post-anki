import Foundation

extension APIClient {
    static func chatQueueSearchPath(q: String) -> String {
        let term = String(q.trimmingCharacters(in: .whitespacesAndNewlines).prefix(ChatQueueSearchLimits.maxChars))

        return "/knowledge-bits/chat-queue/search" + encodedQuery([URLQueryItem(name: "q", value: term)])
    }

    public static func searchChatQueueResponse(q: String) async throws -> ChatQueueSearchResponse {
        try await request(chatQueueSearchPath(q: q))
    }

    public static func searchChatQueue(q: String) async throws -> [ChatQueueSearchHit] {
        try await searchChatQueueResponse(q: q).results
    }
}
