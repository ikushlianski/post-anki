import Foundation

extension APIClient {
    public static func homeSummary() async throws -> HomeSummary {
        try await request("/home/summary")
    }

    public static func streak(baseURL: String? = nil) async throws -> Streak {
        try await request("/streak", baseURL: baseURL)
    }

    public static func milestones() async throws -> [Milestone] {
        try await request("/milestones")
    }

    public static func retentionReport() async throws -> RetentionReport {
        try await request("/analytics/retention")
    }

    public static func weeklyDigest() async throws -> WeeklyDigest {
        try await request("/analytics/digest")
    }

    public static func curriculumStats(id: String) async throws -> CurriculumStats {
        try await request("/curricula/\(encodedSegment(id))/stats")
    }
}
