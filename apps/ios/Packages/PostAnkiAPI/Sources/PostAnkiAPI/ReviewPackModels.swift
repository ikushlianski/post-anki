import Foundation

public struct ReviewPackCard: Codable, Hashable, Sendable {
    public let card: ReviewCard
    public let subjectId: String?
    public let alternates: [ReviewCard]

    private enum CodingKeys: String, CodingKey {
        case subjectId, alternates
    }

    public init(card: ReviewCard, subjectId: String? = nil, alternates: [ReviewCard] = []) {
        self.card = card
        self.subjectId = subjectId
        self.alternates = alternates
    }

    public init(from decoder: Decoder) throws {
        card = try ReviewCard(from: decoder)

        let container = try decoder.container(keyedBy: CodingKeys.self)

        subjectId = try container.decodeIfPresent(String.self, forKey: .subjectId)
        alternates = try container.decodeIfPresent([ReviewCard].self, forKey: .alternates) ?? []
    }

    public func encode(to encoder: Encoder) throws {
        try card.encode(to: encoder)

        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encodeIfPresent(subjectId, forKey: .subjectId)
        try container.encode(alternates, forKey: .alternates)
    }
}

public struct ReviewPack: Codable, Hashable, Sendable {
    public let generatedAt: String
    public let dueBefore: String
    public let truncated: Bool
    public let cards: [ReviewPackCard]

    public init(generatedAt: String, dueBefore: String, truncated: Bool, cards: [ReviewPackCard]) {
        self.generatedAt = generatedAt
        self.dueBefore = dueBefore
        self.truncated = truncated
        self.cards = cards
    }
}
