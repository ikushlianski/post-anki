import Foundation

extension APIClient {
    public static func scanSubjectDuplicates() async throws -> SubjectDuplicateScanResult {
        try await request("/subject-duplicate-scans", method: "POST")
    }

    public static func subjectDuplicateSuggestions() async throws -> [SubjectDuplicateSuggestion] {
        try await request("/subject-duplicate-suggestions?status=pending")
    }

    public static func resolveSubjectDuplicate(id: String, keepSubjectId: String?) async throws {
        let body = SubjectDuplicateResolveInput(
            status: keepSubjectId == nil ? "rejected" : "accepted",
            targetSubjectId: keepSubjectId
        )
        let _: EmptyResponse = try await request(
            "/subject-duplicate-suggestions/\(encodedSegment(id))",
            method: "PATCH",
            body: body
        )
    }

    public static func scanSourceDuplicates() async throws {
        let _: EmptyResponse = try await request("/source-duplicate-scans", method: "POST")
    }

    public static func sourceDuplicateSuggestions() async throws -> [SourceDuplicateSuggestion] {
        try await request("/source-duplicate-suggestions?status=pending")
    }

    public static func resolveSourceDuplicate(id: String, acknowledged: Bool) async throws {
        let _: EmptyResponse = try await request(
            "/source-duplicate-suggestions/\(encodedSegment(id))",
            method: "PATCH",
            body: SourceDuplicateResolveInput(status: acknowledged ? "acknowledged" : "dismissed")
        )
    }

    public static func duplicateReviewSources() async throws -> [DuplicateReviewSourceName] {
        try await request("/sources")
    }
}
