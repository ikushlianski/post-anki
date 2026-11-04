import Foundation

extension APIClient {
    public static func weeklyDigestSummary() async throws -> WeeklyDigestSummary {
        do {
            return try await request("/analytics/weekly-digest")
        } catch {
            throw WeeklyDigestFailure.failure(for: error)
        }
    }
}

public enum WeeklyDigestMessages {
    public static let loadFailure = "Couldn't load the weekly digest."
    public static let retry = "Try again"
}
