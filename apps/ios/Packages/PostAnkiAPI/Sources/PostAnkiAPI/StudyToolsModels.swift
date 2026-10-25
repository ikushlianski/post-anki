import Foundation

public struct AskAllCardsInput: Encodable, Sendable {
    public let message: String
    public let transcript: [ChatTranscriptEntry]?
    public let allowGeneralKnowledge: Bool
}

public struct MatchedCard: Decodable, Sendable, Hashable, Identifiable {
    public let variantId: String
    public let prompt: String
    public let topicTitle: String

    public var id: String { variantId }
}

public struct AskAllCardsResult: Decodable, Sendable {
    public let reply: String
    public let matchedCards: [MatchedCard]
    public let lookupFailed: Bool
}

public struct TopicChatInput: Encodable, Sendable {
    public let message: String
    public let transcript: [ChatTranscriptEntry]?
}

public struct TopicChatResult: Decodable, Sendable {
    public let reply: String
}

public struct Note: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let nodeType: String
    public let nodeId: String
    public let body: String
    public let isHighlight: Bool
    public let concern: String?
    public let lastSurfacedAt: String?
    public let createdAt: String
    public let updatedAt: String
}

public struct CreateNoteInput: Encodable, Sendable {
    public let nodeType: String
    public let nodeId: String
    public let body: String
    public let isHighlight: Bool
}

public struct OpenQuestion: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let sourceType: String
    public let sourceItemId: String
    public let topicId: String?
    public let topicTitle: String?
    public let questionText: String
    public let status: String
    public let answerText: String?
    public let createdAt: String
    public let resolvedAt: String?
}

public struct OpenQuestionsPage: Decodable, Sendable {
    public let items: [OpenQuestion]
    public let totalCount: Int
}

public enum OpenQuestionResolution: String, Sendable {
    case answered
    case dismissed
}

public struct ResolveOpenQuestionInput: Encodable, Sendable {
    public let status: String
    public let answerText: String?

    public enum CodingKeys: String, CodingKey, Sendable {
        case status
        case answerText
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(status, forKey: .status)

        let trimmed = answerText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if !trimmed.isEmpty {
            try container.encode(trimmed, forKey: .answerText)
        }
    }
}

public struct StudyChatTurn: Hashable, Identifiable, Sendable {
    public let id = UUID()
    public let entry: ChatTranscriptEntry
    public var matchedCards: [MatchedCard] = []
    public var lookupFailed = false

    public init(
        entry: ChatTranscriptEntry,
        matchedCards: [MatchedCard] = [],
        lookupFailed: Bool = false
    ) {
        self.entry = entry
        self.matchedCards = matchedCards
        self.lookupFailed = lookupFailed
    }
}

public enum StudyToolsError: Sendable {
    public static func message(for error: Error, notFound: String = "That item no longer exists.") -> String {
        if let apiError = error as? APIError {
            switch apiError {
            case .unauthorized:
                return "Check Settings: your access token was rejected."
            case .badStatus(404, _):
                return notFound
            case .badStatus, .badURL:
                return "Something went wrong. Try again."
            }
        }

        if error is CancellationError || (error as? URLError)?.code == .cancelled {
            return "Loading was interrupted. Try again."
        }

        if error is URLError {
            return "Couldn't connect to the server. Try again."
        }

        return "Something went wrong. Try again."
    }
}
