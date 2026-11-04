import Foundation

extension APIClient {
    public static func goalStreak() async throws -> GoalStreak {
        try await request("/motivation/streak")
    }
}
