import Foundation

extension APIClient {
    static func ownerStatsPath(_ resource: String, tz: String, days: Int) -> String {
        "/stats/\(resource)" + encodedQuery([URLQueryItem(name: "tz", value: tz), URLQueryItem(name: "days", value: String(days))])
    }

    public static func ownerLearningStats(days: Int, tz: String = TimeZone.current.identifier) async throws -> OwnerLearningStats {
        try await request(ownerStatsPath("learning", tz: tz, days: days))
    }

    public static func ownerAiSpend(days: Int, tz: String = TimeZone.current.identifier) async throws -> OwnerAiSpend {
        try await request(ownerStatsPath("ai-spend", tz: tz, days: days))
    }
}
