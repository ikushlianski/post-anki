import Foundation

extension APIClient {
    static func dailyGoalProgressPath(tz: String) -> String {
        "/study-goal/daily/progress" + encodedQuery([URLQueryItem(name: "tz", value: tz)])
    }

    public static func dailyGoalProgress(tz: String = TimeZone.current.identifier) async throws -> DailyGoalProgress {
        try await request(dailyGoalProgressPath(tz: tz))
    }
}
