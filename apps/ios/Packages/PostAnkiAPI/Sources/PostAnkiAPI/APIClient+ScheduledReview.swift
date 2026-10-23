import Foundation

extension APIClient {
    public static func reviewCards(limit: Int = 20, tz: String) async throws -> ReviewCardsResponse {
        try await request(encodedPath("/knowledge-bits/review-cards", query: [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "tz", value: tz)
        ]))
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
