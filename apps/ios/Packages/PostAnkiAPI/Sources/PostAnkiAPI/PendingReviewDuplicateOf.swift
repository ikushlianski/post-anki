import Foundation

public struct PendingReviewDuplicateOf: Decodable, Sendable, Hashable {
    public let bitId: String
    public let front: String
    public let back: String?
    public let similarity: Double
    public let reason: String?
    public let similarBitIds: [String]

    private enum CodingKeys: String, CodingKey {
        case bitId, front, back, similarity, reason, similarBitIds
    }

    public init(bitId: String, front: String, back: String?, similarity: Double, reason: String? = nil, similarBitIds: [String] = []) {
        self.bitId = bitId
        self.front = front
        self.back = back
        self.similarity = similarity
        self.reason = reason
        self.similarBitIds = similarBitIds
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        bitId = try container.decode(String.self, forKey: .bitId)
        front = try container.decode(String.self, forKey: .front)
        back = try container.decodeIfPresent(String.self, forKey: .back)
        similarity = try container.decodeIfPresent(Double.self, forKey: .similarity) ?? 0
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        similarBitIds = try container.decodeIfPresent([String].self, forKey: .similarBitIds) ?? []
    }

    public var similarCard: SimilarCard { SimilarCard(bitId: bitId, front: front, back: back) }

    public var otherSimilarCount: Int { similarBitIds.filter { $0 != bitId }.count }

    public struct SimilarCard: Sendable, Hashable, Identifiable {
        public let bitId: String
        public let front: String
        public let back: String?

        public var id: String { bitId }
    }
}
