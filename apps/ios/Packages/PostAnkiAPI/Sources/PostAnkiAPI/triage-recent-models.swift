import Foundation

public enum TriageHistorySearchMode: String, Sendable, CaseIterable, Identifiable {
    case both
    case text
    case meaning

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .both: "Words and meaning"
        case .text: "Words only"
        case .meaning: "Meaning only"
        }
    }
}

public struct TriageRecentDecision: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let sessionId: String?
    public let bitId: String?
    public let verdict: String?
    public var reasonCode: String?
    public let note: String?
    public let decidedAt: String?
    public let front: String?
    public let back: String?
    public let subjectType: String?
    public let rejectReasonCodes: [String]?
    public let extractionModelId: String?
    public let fusionModelIds: [String]?
    public let score: Double?
    public let matchedBy: String?

    public var isRejected: Bool { verdict == "rejected" }

    public var needsReason: Bool { isRejected && (reasonCode ?? "").isEmpty }
}

public struct TriageRecentDecisions: Decodable, Sendable {
    public let days: Int?
    public let mode: String?
    public let meaningUnavailable: Bool?
    public let decisions: [TriageRecentDecision]
}

struct PatchTriageDecisionReasonInput: Encodable, Sendable {
    let reasonCode: String?
    let note: String?

    enum CodingKeys: String, CodingKey {
        case reasonCode, note
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(reasonCode, forKey: .reasonCode)
        try container.encodeIfPresent(note, forKey: .note)
    }
}
