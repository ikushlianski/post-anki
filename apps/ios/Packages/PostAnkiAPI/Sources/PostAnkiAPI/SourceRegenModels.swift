import Foundation

public struct SourceRegenInput: Encodable, Sendable {
    public let text: String?

    public init(text: String? = nil) {
        self.text = text
    }
}

public struct SourceRegenStartResult: Decodable, Sendable {
    public let status: String
    public let supersededCount: Int
}

public struct SourceRegenStatus: Decodable, Sendable {
    public let status: String
    public let failureReason: String?
    public let outcome: String?
    public let cardCount: Int?

    public init(status: String, failureReason: String? = nil, outcome: String? = nil, cardCount: Int? = nil) {
        self.status = status
        self.failureReason = failureReason
        self.outcome = outcome
        self.cardCount = cardCount
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)

        status = try c.decode(String.self, forKey: .status)
        failureReason = try c.decodeIfPresent(String.self, forKey: .failureReason)
        outcome = try c.decodeIfPresent(String.self, forKey: .outcome)
        cardCount = try c.decodeIfPresent(Int.self, forKey: .cardCount)
    }

    private enum CodingKeys: String, CodingKey {
        case status, failureReason, outcome, cardCount
    }

    public var isFinished: Bool { status != "running" }

    public var summaryText: String? {
        switch outcome {
        case "cards":
            let n = cardCount ?? 0

            return n == 1 ? "1 card created" : "\(n) cards created"
        case "nothing":
            return "Nothing worth keeping in this note"
        case "failed":
            let reason = failureReason?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

            return reason.isEmpty ? "Extraction failed, retry." : "Extraction failed, retry. \(reason)"
        default:
            return nil
        }
    }
}

public struct MoreVariantsResult: Decodable, Sendable {
    public let ok: Bool
}

public enum ExtractionSummaryGuard {
    public static func shouldApply(trackedSourceId: String?, resultSourceId: String, isCancelled: Bool) -> Bool {
        !isCancelled && trackedSourceId == resultSourceId
    }
}
