import Foundation

extension APIClient {
    public static func dailyPush() async throws -> DailyPushResponse {
        try await request("/daily-push?mode=socratic")
    }

    public static func dueQueue() async throws -> DueQueueResponse {
        try await request("/due-queue")
    }
}
