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
