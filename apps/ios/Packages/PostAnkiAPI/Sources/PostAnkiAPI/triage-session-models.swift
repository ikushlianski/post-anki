import Foundation

public enum TriageVerdict: String, Codable, Sendable, Hashable {
    case approved
    case rejected
}

public struct TriageDecision: Codable, Sendable, Hashable {
    public let bitId: String
    public let verdict: TriageVerdict

    public init(bitId: String, verdict: TriageVerdict) {
        self.bitId = bitId
        self.verdict = verdict
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
}

struct StartTriageSessionInput: Encodable, Sendable {
    let subjectId: String?
}

struct FinishTriageSessionInput: Encodable, Sendable {
    let feedbackText: String
    let decisions: [TriageDecision]
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
