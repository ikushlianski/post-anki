extension APIClient {
    public static func rejectReasonsStatistics() async throws -> RejectReasonsStatistics {
        try await request("/analytics/reject-reasons")
    }

    public static func nothingExtractedStatistics() async throws -> NothingExtractedStatistics {
        try await request("/analytics/nothing-extracted")
    }

    public static func chatQueueOutcomesStatistics() async throws -> ChatQueueOutcomesStatistics {
        try await request("/analytics/chat-queue-outcomes")
    }
}
