import Foundation

public struct SimilarCardDetail: Decodable, Sendable {
    public struct Phrasing: Decodable, Sendable {
        public let prompt: String
        public let answer: String?
    }

    public let knowledgeBitId: String
    public let body: String
    public let phrasings: [Phrasing]?

    public var card: PendingReviewDuplicateOf.SimilarCard {
        let first = phrasings?.first

        return PendingReviewDuplicateOf.SimilarCard(bitId: knowledgeBitId, front: first?.prompt ?? body, back: first?.answer)
    }
}

extension APIClient {
    public static func similarCardDetail(id: String) async throws -> SimilarCardDetail {
        try await request("/knowledge-bits/\(encodedSegment(id))")
    }
}
