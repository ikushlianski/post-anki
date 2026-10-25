import Foundation

public enum TriageReasonUpdate: Sendable, Equatable {
    case unchanged
    case clear
    case set(String)
}

public struct TriageDecisionRecord: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let sessionId: String?
    public let bitId: String?
    public let verdict: String?
    public let reasonCode: String?
    public let note: String?
    public let decidedAt: String?
    public let orderIndex: Int?
    public let dwellMs: Int?
    public let front: String?
    public let back: String?
    public let undoneAt: String?
    public let source: String?
}

public struct TriageDecisionList: Decodable, Sendable {
    public let decisions: [TriageDecisionRecord]
}

struct PutTriageDecisionInput: Encodable, Sendable {
    let verdict: TriageVerdict
    let note: String?
    let reason: TriageReasonUpdate
    let dwellMs: Int?

    enum CodingKeys: String, CodingKey {
        case verdict, note, reasonCode, dwellMs
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(verdict, forKey: .verdict)
        try container.encodeIfPresent(note, forKey: .note)
        try container.encodeIfPresent(dwellMs, forKey: .dwellMs)

        switch reason {
        case .unchanged: break
        case .clear: try container.encodeNil(forKey: .reasonCode)
        case .set(let code): try container.encode(code, forKey: .reasonCode)
        }
    }
}
