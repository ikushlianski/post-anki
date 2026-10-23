import Foundation

extension APIClient {
    public static func domainPrioritySuggestions(subjectId: String) async throws -> [DomainPrioritySuggestion] {
        try await request("/subjects/\(encodedSegment(subjectId))/domain-priority-suggestions?status=pending")
    }

    public static func domainPriorityReviewStatus(subjectId: String) async throws -> DomainPriorityReviewStatus {
        try await request("/subjects/\(encodedSegment(subjectId))/domain-priority-review-status")
    }

    public static func runDomainPriorityReview(subjectId: String) async throws {
        let _: EmptyResponse = try await request(
            "/subjects/\(encodedSegment(subjectId))/domain-priority-reviews",
            method: "POST"
        )
    }

    public static func resolveDomainPrioritySuggestion(id: String, accepted: Bool) async throws {
        let _: EmptyResponse = try await request(
            "/domain-priority-suggestions/\(encodedSegment(id))",
            method: "PATCH",
            body: ResolveSuggestionInput(accepted: accepted)
        )
    }

    public static func runDocScan(subjectId: String) async throws {
        let _: EmptyResponse = try await request(
            "/subjects/\(encodedSegment(subjectId))/doc-scans",
            method: "POST"
        )
    }

    public static func docScanSuggestions(subjectId: String) async throws -> DocScanSuggestions {
        try await request("/subjects/\(encodedSegment(subjectId))/doc-scan-suggestions")
    }

    public static func resolveDomainTopicSuggestion(id: String, accepted: Bool) async throws {
        let _: EmptyResponse = try await request(
            "/domain-topic-suggestions/\(encodedSegment(id))",
            method: "PATCH",
            body: ResolveSuggestionInput(accepted: accepted)
        )
    }

    public static func resolveDomainSupersessionSuggestion(id: String, accepted: Bool) async throws {
        let _: EmptyResponse = try await request(
            "/domain-supersession-suggestions/\(encodedSegment(id))",
            method: "PATCH",
            body: ResolveSuggestionInput(accepted: accepted)
        )
    }

    public static func domainRecommendations(subjectId: String) async throws -> [DomainRecommendation] {
        try await request("/subjects/\(encodedSegment(subjectId))/domain-recommendations")
    }

    public static func runDomainRecommendations(subjectId: String) async throws {
        let _: EmptyResponse = try await request(
            "/subjects/\(encodedSegment(subjectId))/domain-recommendations",
            method: "POST"
        )
    }

    public static func resolveDomainRecommendation(id: String, accepted: Bool) async throws -> DomainRecommendation {
        try await request(
            "/domain-recommendations/\(encodedSegment(id))",
            method: "PATCH",
            body: ResolveSuggestionInput(accepted: accepted)
        )
    }
}
