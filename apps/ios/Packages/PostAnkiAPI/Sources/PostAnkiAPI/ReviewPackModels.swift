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
    public let dayKey: String?
    public let skippedSubjectIds: [String]

    private enum CodingKeys: String, CodingKey {
        case generatedAt, dueBefore, truncated, cards, dayKey, skippedSubjectIds
    }

    public init(
        generatedAt: String,
        dueBefore: String,
        truncated: Bool,
        cards: [ReviewPackCard],
        dayKey: String? = nil,
        skippedSubjectIds: [String] = []
    ) {
        self.generatedAt = generatedAt
        self.dueBefore = dueBefore
        self.truncated = truncated
        self.cards = cards
        self.dayKey = dayKey
        self.skippedSubjectIds = skippedSubjectIds
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        generatedAt = try container.decode(String.self, forKey: .generatedAt)
        dueBefore = try container.decode(String.self, forKey: .dueBefore)
        truncated = try container.decode(Bool.self, forKey: .truncated)
        cards = try container.decode([ReviewPackCard].self, forKey: .cards)
        dayKey = try container.decodeIfPresent(String.self, forKey: .dayKey)
        skippedSubjectIds = try container.decodeIfPresent([String].self, forKey: .skippedSubjectIds) ?? []
    }
}
