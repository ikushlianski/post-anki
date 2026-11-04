import Foundation

extension APIClient {
    static func learningStatsPath(tz: String, days: Int) -> String {
        "/stats/learning" + encodedQuery([URLQueryItem(name: "tz", value: tz), URLQueryItem(name: "days", value: String(days))])
    }

    public static func learningStats(days: Int = LearningStats.windowDays, tz: String = TimeZone.current.identifier) async throws -> LearningStats {
        try await request(learningStatsPath(tz: tz, days: days))
    }
}
