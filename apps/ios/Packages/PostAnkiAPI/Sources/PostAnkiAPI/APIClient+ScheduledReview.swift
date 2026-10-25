import Foundation

extension APIClient {
    public static func reviewCards(limit: Int = 20, tz: String, subjectId: String? = nil, tagId: String? = nil, topicId: String? = nil, knowledgeBitId: String? = nil) async throws -> ReviewCardsResponse {
        var query = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "tz", value: tz)
        ]

        let scopes = [("subjectId", subjectId), ("tagId", tagId), ("topicId", topicId), ("knowledgeBitId", knowledgeBitId)]

        for case (let name, let value?) in scopes { query.append(URLQueryItem(name: name, value: value)) }

        return try await request(encodedPath("/knowledge-bits/review-cards", query: query))
    }

    public static func recordReview(_ input: RecordReviewInput) async throws -> RecordReviewResult {
        try await request("/knowledge-bits/reviews", method: "POST", body: input)
    }
}

extension APIClient {
    public static func undoReview(reviewId: String) async throws -> UndoReviewResult {
        try await request("/knowledge-bits/reviews/\(encodedSegment(reviewId))", method: "DELETE")
    }
}
