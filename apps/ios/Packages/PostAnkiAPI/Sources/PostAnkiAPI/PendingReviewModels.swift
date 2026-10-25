import Foundation

public struct PendingReviewSource: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeSourceId: String
    public let sourceText: String?
    public let subjectName: String?
    public let subjectId: String?
    public let bits: [PendingReviewBit]

    public var id: String { knowledgeSourceId }

    public init(
        knowledgeSourceId: String,
        sourceText: String?,
        subjectName: String?,
        bits: [PendingReviewBit],
        subjectId: String? = nil
    ) {
        self.knowledgeSourceId = knowledgeSourceId
        self.sourceText = sourceText
        self.subjectName = subjectName
        self.subjectId = subjectId
        self.bits = bits
    }
}

public struct PendingReviewBit: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let body: String
    public let background: String?
    public let origin: String
    public let variants: [PendingReviewVariant]
}

public struct PendingReviewVariant: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let kind: String
    public let prompt: String
    public let answer: String

    public var kindLabel: String {
        switch kind {
        case "wh_question": return "Question"
        case "fill_in_the_blank": return "Fill in the blank"
        case "basic": return "Basic card"
        default: return kind
        }
    }
}

public struct PendingReviewCountResponse: Decodable, Sendable {
    public let count: Int
}

public enum PendingReviewDecision: Sendable {
    case approve
    case reject

    public var verb: String {
        switch self {
        case .approve: return "approve"
        case .reject: return "reject"
        }
    }
}

public enum PendingReviewDecisionOutcome: Sendable {
    case removed
    case removedElsewhere
    case kept(message: String)
}

extension PendingReviewDecision {
    public func outcome(for error: Error) -> PendingReviewDecisionOutcome {
        if error is CancellationError {
            return .kept(message: "")
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled:
                return .kept(message: "")
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost:
                return .kept(message: "Couldn't connect to the server. Nothing was changed, try again in a moment.")
            default:
                break
            }
        }

        if let apiError = error as? APIError {
            switch apiError {
            case .badStatus(409, "no_variant"):
                return .kept(message: "This item has no questions yet, so it can't be approved.")
            case .badStatus(409, "blocked"), .badStatus(404, "not_found"):
                return .removedElsewhere
            case .unauthorized:
                return .kept(message: "Your access token was rejected. Check Settings.")
            default:
                break
            }
        }

        return .kept(message: "Couldn't \(verb) this item. Try again.")
    }
}

extension PendingReviewSource {
    public func withBits(_ bits: [PendingReviewBit]) -> PendingReviewSource {
        PendingReviewSource(knowledgeSourceId: knowledgeSourceId, sourceText: sourceText, subjectName: subjectName, bits: bits, subjectId: subjectId)
    }
}

public struct PendingReviewTriageInput: Encodable, Sendable {
    public let keepVariantIds: [String]
}

public enum PendingReviewTriageOutcome: Sendable, Equatable {
    case removed
    case removedElsewhere
    case kept(message: String)

    public static func outcome(for error: Error) -> PendingReviewTriageOutcome {
        if let apiError = error as? APIError, case .badStatus(let status, let code) = apiError {
            switch (status, code) {
            case (409, "variant_not_active"):
                return .kept(message: "One of those questions changed. Reload to see the current ones.")
            case (400, "invalid_input"):
                return .kept(message: "Keep one or two questions.")
            default:
                break
            }
        }

        switch PendingReviewDecision.approve.outcome(for: error) {
        case .removed: return .removed
        case .removedElsewhere: return .removedElsewhere
        case .kept(let message): return .kept(message: message)
        }
    }
}

public struct PendingReviewBulkApprovalInput: Encodable, Sendable {
    public let knowledgeBitIds: [String]
}

public struct PendingReviewBulkSkip: Decodable, Sendable {
    public let id: String
    public let reason: String
}

public struct PendingReviewBulkApprovalResult: Decodable, Sendable {
    public let approved: [String]
    public let skipped: [PendingReviewBulkSkip]

    public init(
        approved: [String],
        skipped: [PendingReviewBulkSkip]
    ) {
        self.approved = approved
        self.skipped = skipped
    }
}

public struct PendingReviewRemovedBit: Sendable {
    public let sourceId: String
    public let sourceText: String?
    public let subjectName: String?
    public let index: Int
    public let bit: PendingReviewBit

    public init(
        sourceId: String,
        sourceText: String?,
        subjectName: String?,
        index: Int,
        bit: PendingReviewBit
    ) {
        self.sourceId = sourceId
        self.sourceText = sourceText
        self.subjectName = subjectName
        self.index = index
        self.bit = bit
    }
}

public struct PendingReviewUndo: Sendable {
    public let removed: PendingReviewRemovedBit
    public var isRestoring = false
    public var message: String?
    public var canRetry = true

    public init(
        removed: PendingReviewRemovedBit,
        isRestoring: Bool = false,
        message: String? = nil,
        canRetry: Bool = true
    ) {
        self.removed = removed
        self.isRestoring = isRestoring
        self.message = message
        self.canRetry = canRetry
    }
}

public enum PendingReviewRestoreOutcome: Sendable {
    case restored
    case alreadyChanged
    case retryable(message: String)
    case fatal(message: String)
    case cancelled

    public static func restoreOutcome(for error: Error) -> PendingReviewRestoreOutcome {
        if error is CancellationError { return .cancelled }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled:
                return .cancelled
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost:
                return .retryable(message: "Couldn't connect to the server. Try Undo again.")
            default:
                break
            }
        }

        if let apiError = error as? APIError {
            switch apiError {
            case .badStatus(404, _):
                return .alreadyChanged
            case .unauthorized:
                return .fatal(message: "Your access token was rejected. Check Settings.")
            default:
                break
            }
        }

        return .retryable(message: "Couldn't restore. Try again.")
    }
}

extension PendingReviewBulkApprovalResult {
    public func summary() -> String {
        var text = "Approved \(approved.count)."
        let alreadyDecided = skipped.filter { $0.reason == "already_decided" || $0.reason == "not_found" }.count
        let noVariant = skipped.filter { $0.reason == "no_variant" }.count
        let other = skipped.count - alreadyDecided - noVariant
        var parts: [String] = []

        if alreadyDecided > 0 { parts.append("\(alreadyDecided) already decided") }

        if noVariant > 0 { parts.append("\(noVariant) \(noVariant == 1 ? "has" : "have") no questions yet") }

        if other > 0 { parts.append("\(other) other") }

        if !skipped.isEmpty {
            text += " Skipped \(skipped.count): \(parts.joined(separator: ", "))."
        }

        return text
    }
}

extension PendingReviewDecision {
    public static func bulkErrorMessage(for error: Error) -> String? {
        if error is CancellationError { return nil }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled:
                return nil
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost:
                return "Couldn't connect to the server. Nothing was changed, try again in a moment."
            default:
                break
            }
        }

        if case APIError.unauthorized = error {
            return "Your access token was rejected. Check Settings."
        }

        return "Couldn't approve these items. Try again."
    }
}
