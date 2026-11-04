import Foundation

public struct DraftKnowledgeBitChatInput: Encodable, Sendable {
    public let mode: String
    public let transcript: [ChatTranscriptEntry]
    public let instruction: String
    public let allowWebSearch: Bool
}

public struct CardProposal: Decodable, Hashable, Sendable {
    public let front: String
    public let back: String
    public let example: String?
    public let sources: [String]
    public let usedWebSearch: Bool

    public init(front: String, back: String, example: String? = nil, sources: [String] = [], usedWebSearch: Bool = false) {
        self.front = front
        self.back = back
        self.example = example
        self.sources = sources
        self.usedWebSearch = usedWebSearch
    }
}

public struct DraftKnowledgeBitChatResult: Decodable, Sendable {
    public let sources: [String]
    public let card: CardProposal
}

public struct CreateDerivedItemInput: Encodable, Sendable {
    public let front: String
    public let back: String
    public let example: String?
    public let aiGenerated: Bool
    public let sourceLinks: [String]
}

public struct DerivedItemResult: Decodable, Sendable {
    public let id: String
}

public enum KnowledgeBitReplacement {
    public static let instruction = "Write one replacement card that fixes the problems we discussed in this card."
    public static let maxTranscriptMessages = 20

    public static func recentTranscript(_ transcript: [ChatTranscriptEntry]) -> [ChatTranscriptEntry] {
        Array(transcript.suffix(maxTranscriptMessages))
    }

    public static func derivedItemInput(for card: CardProposal) -> CreateDerivedItemInput {
        let example = card.example?.trimmingCharacters(in: .whitespacesAndNewlines)

        return CreateDerivedItemInput(
            front: card.front.trimmingCharacters(in: .whitespacesAndNewlines),
            back: card.back.trimmingCharacters(in: .whitespacesAndNewlines),
            example: example?.isEmpty == false ? example : nil,
            aiGenerated: card.usedWebSearch,
            sourceLinks: card.usedWebSearch ? card.sources : []
        )
    }
}
