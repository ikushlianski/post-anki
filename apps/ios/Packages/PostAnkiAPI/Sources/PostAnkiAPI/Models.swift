import Foundation

public struct Subject: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let description: String?
    public let parentId: String?
}

public struct Curriculum: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let subjectId: String
    public let name: String
    public let description: String?
    public let status: String

    public init(
        id: String,
        subjectId: String,
        name: String,
        description: String?,
        status: String
    ) {
        self.id = id
        self.subjectId = subjectId
        self.name = name
        self.description = description
        self.status = status
    }
}

public struct Topic: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let moduleId: String
    public let title: String
}

public struct Module: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let curriculumId: String
    public let title: String
    public let topics: [Topic]
}

public struct CurriculumDetail: Codable, Sendable {
    public let curriculum: Curriculum
    public let modules: [Module]
}

public struct NextQuestionVariant: Codable, Identifiable, Hashable, Sendable {
    public let variantId: String
    public let kind: String
    public let prompt: String
    public let knowledgeBitId: String
    public let bitBody: String

    public var id: String { variantId }
}

public struct GradeQuestionVariantAnswerResult: Codable, Sendable {
    public let ok: Bool
    public let score: Int?
    public let verdict: String?
    public let feedback: String?
    public let followUpQuestion: String?
    public let error: String?
}

public struct GradeQuestionVariantAnswerInput: Codable, Sendable {
    public let userAnswer: String
}

struct APIErrorBody: Codable {
    let error: String?
}

public struct CreateKnowledgeSourceInput: Codable, Sendable {
    public let text: String
    public let subjectId: String?
}

public struct CreateKnowledgeSourceResult: Codable, Sendable {
    public let id: String?
}

// Response shape of scan/trigger endpoints isn't needed by the client —
// only that the call succeeded — so decoding never inspects the body.
public struct EmptyResponse: Decodable, Sendable {
    public init(from decoder: Decoder) throws {}
}

public struct PendingPlacementSuggestion: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let body: String
    public let placementSuggestion: String
}

// Mirrors the API's z.discriminatedUnion("status", [...]) — Swift has no
// discriminated-union Encodable, so this hand-writes the same two JSON shapes.
public struct ResolvePlacementSuggestionInput: Encodable, Sendable {
    public let status: String
    public let moduleId: String?
    public let title: String?

    public static func accepted(moduleId: String, title: String) -> ResolvePlacementSuggestionInput {
        ResolvePlacementSuggestionInput(status: "accepted", moduleId: moduleId, title: title)
    }

    public static let rejected = ResolvePlacementSuggestionInput(status: "rejected", moduleId: nil, title: nil)

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(status, forKey: .status)
        if let moduleId {
            try container.encode(moduleId, forKey: .moduleId)
        }
        if let title {
            try container.encode(title, forKey: .title)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case status, moduleId, title
    }
}

public struct ResolvePlacementSuggestionResult: Decodable, Sendable {
    public let outcome: String?
    public let topicId: String?
}

public struct ChatTranscriptEntry: Codable, Hashable, Sendable {
    public let role: String
    public let text: String

    public init(
        role: String,
        text: String
    ) {
        self.role = role
        self.text = text
    }
}

public struct ChatWithKnowledgeBitInput: Encodable, Sendable {
    public let message: String
    public let transcript: [ChatTranscriptEntry]?
}

public struct ChatWithKnowledgeBitResult: Decodable, Sendable {
    public let reply: String
}
