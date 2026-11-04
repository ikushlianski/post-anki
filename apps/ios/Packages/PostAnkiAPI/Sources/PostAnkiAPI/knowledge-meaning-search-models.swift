import Foundation

public struct KnowledgeMeaningPhrasing: Decodable, Sendable, Hashable {
    public let id: String
    public let kind: String
    public let prompt: String
}

public struct KnowledgeMeaningMatch: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeBitId: String
    public let phrasings: [KnowledgeMeaningPhrasing]
    public let answer: String
    public let origin: String
    public let similarity: Double

    public var id: String { knowledgeBitId }

    public var question: String { phrasings.first?.prompt ?? "" }

    public var originLabel: String {
        switch origin {
        case "manual": return "Typed by you"
        case "ai_web": return "Found by AI on the web"
        case "pasted": return "Pasted text"
        case "notion": return "Notion"
        case "article": return "Article"
        default: return origin
        }
    }

    public var matchPercent: Int { Int((similarity * 100).rounded()) }
}

public struct KnowledgeMeaningMatches: Decodable, Sendable {
    public let items: [KnowledgeMeaningMatch]
    public let readyCount: Int
    public let notReadyCount: Int
    public let capped: Bool
}

public enum KnowledgeMeaningSearchError: Sendable {
    public static func message(for error: Error) -> String {
        if let apiError = error as? APIError, case .badStatus(let status, _) = apiError {
            switch status {
            case 429: return "Too many meaning searches. Wait a minute and try again."
            case 502: return "Meaning search is unavailable right now. Try again in a moment."
            default: break
            }
        }

        return KnowledgeManageError.message(for: error, action: "search by meaning")
    }
}
