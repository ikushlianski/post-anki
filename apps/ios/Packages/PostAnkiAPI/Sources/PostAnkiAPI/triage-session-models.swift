import Foundation

public enum TriageVerdict: String, Codable, Sendable, Hashable {
    case approved
    case rejected
}

public struct TriageDecision: Codable, Sendable, Hashable {
    public let bitId: String
    public let verdict: TriageVerdict
    public var note: String?
    public var reasonCode: String?
    public var dwellMs: Int?

    public init(bitId: String, verdict: TriageVerdict, note: String? = nil, reasonCode: String? = nil, dwellMs: Int? = nil) {
        self.bitId = bitId
        self.verdict = verdict
        self.note = note
        self.reasonCode = reasonCode
        self.dwellMs = dwellMs
    }
}

public struct CardStyleNote: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let subjectId: String?
    public let sessionId: String?
    public let text: String
    public let enabled: Bool
    public let createdAt: String
}

public struct TriageSessionResponse: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let subjectId: String?
    public let status: String
    public let startedAt: String
    public let endedAt: String?
    public let acceptedCount: Int
    public let rejectedCount: Int
    public let feedbackText: String?
    public let notes: [CardStyleNote]
    public let client: String?
    public let endedBy: String?
    public let undecidedCount: Int?
    public let lastActivityAt: String?
}

struct StartTriageSessionInput: Encodable, Sendable {
    let subjectId: String?
    let client: String
    let startKey: String?
}

struct FinishTriageSessionInput: Encodable, Sendable {
    let feedbackText: String
    let decisions: [TriageDecision]
    let undecidedCount: Int?
}

struct DiscardTriageSessionInput: Encodable, Sendable {
    let undecidedCount: Int?
}

struct GradeKnowledgeBitInput: Encodable, Sendable {
    let rating: Int
    let note: String?
}

struct GradeKnowledgeBitResult: Decodable, Sendable {
    let feedbackId: String?
}

struct KnowledgeBitFeedbackNoteInput: Encodable, Sendable {
    let note: String
}
