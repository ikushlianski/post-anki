import Foundation

public struct PendingReviewSource: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeSourceId: String
    public let sourceText: String?
    public let subjectName: String?
    public let subjectId: String?
    public let suggestedSubjectId: String?
    public let suggestedSubjectName: String?
    public let suggestedSubjectConfidence: String?
    public let bits: [PendingReviewBit]
    public let attention: KnowledgeSourceAttention?
    public let rejectReasonCodes: [String]?

    public var id: String { knowledgeSourceId }

    public init(
        knowledgeSourceId: String,
        sourceText: String?,
        subjectName: String?,
        bits: [PendingReviewBit],
        subjectId: String? = nil,
        suggestedSubjectId: String? = nil,
        suggestedSubjectName: String? = nil,
        suggestedSubjectConfidence: String? = nil,
        attention: KnowledgeSourceAttention? = nil,
        rejectReasonCodes: [String]? = nil
    ) {
        self.knowledgeSourceId = knowledgeSourceId
        self.sourceText = sourceText
        self.subjectName = subjectName
        self.subjectId = subjectId
        self.suggestedSubjectId = suggestedSubjectId
        self.suggestedSubjectName = suggestedSubjectName
        self.suggestedSubjectConfidence = suggestedSubjectConfidence
        self.bits = bits
        self.attention = attention
        self.rejectReasonCodes = rejectReasonCodes
    }
}

public struct PendingReviewBit: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let body: String
    public let background: String?
    public let exampleAiGeneratedAt: String?
    public let origin: String
    public let variants: [PendingReviewVariant]
    public let answerChoice: Bool
    public let createdAt: String?
    public let modelIds: [String]
    public let aiSuggestion: String?
    public let duplicateOf: PendingReviewDuplicateOf?

    private enum CodingKeys: String, CodingKey {
        case id, body, background, exampleAiGeneratedAt, origin, variants, answerChoice, createdAt, modelIds, aiSuggestion, duplicateOf
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        body = try container.decode(String.self, forKey: .body)
        background = try container.decodeIfPresent(String.self, forKey: .background)
        exampleAiGeneratedAt = try container.decodeIfPresent(String.self, forKey: .exampleAiGeneratedAt)
        origin = try container.decode(String.self, forKey: .origin)
        variants = try container.decode([PendingReviewVariant].self, forKey: .variants)
        answerChoice = try container.decodeIfPresent(Bool.self, forKey: .answerChoice) ?? false
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        modelIds = try container.decodeIfPresent([String].self, forKey: .modelIds) ?? []
        aiSuggestion = try container.decodeIfPresent(String.self, forKey: .aiSuggestion)
        duplicateOf = try? container.decodeIfPresent(PendingReviewDuplicateOf.self, forKey: .duplicateOf)
    }

    public init(
        id: String,
        body: String,
        background: String?,
        origin: String,
        variants: [PendingReviewVariant],
        exampleAiGeneratedAt: String? = nil,
        answerChoice: Bool = false,
        createdAt: String? = nil,
        modelIds: [String] = [],
        aiSuggestion: String? = nil,
        duplicateOf: PendingReviewDuplicateOf? = nil
    ) {
        self.id = id
        self.body = body
        self.background = background
        self.exampleAiGeneratedAt = exampleAiGeneratedAt
        self.origin = origin
        self.variants = variants
        self.answerChoice = answerChoice
        self.createdAt = createdAt
        self.modelIds = modelIds
        self.aiSuggestion = aiSuggestion
        self.duplicateOf = duplicateOf
    }

    public var offersSentenceChoice: Bool { answerChoice && variants.count > 1 }

    public func withExample(_ background: String?, aiGeneratedAt: String?) -> PendingReviewBit {
        PendingReviewBit(
            id: id,
            body: body,
            background: background,
            origin: origin,
            variants: variants,
            exampleAiGeneratedAt: aiGeneratedAt,
            answerChoice: answerChoice,
            createdAt: createdAt,
            modelIds: modelIds,
            aiSuggestion: aiSuggestion,
            duplicateOf: duplicateOf
        )
    }

    public var hasHumanExample: Bool {
        let text = background?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        return !text.isEmpty && exampleAiGeneratedAt == nil
    }

    public var hasAiExample: Bool { exampleAiGeneratedAt != nil && !(background ?? "").isEmpty }
}

public struct PendingReviewVariant: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let kind: String
    public let context: String?
    public let prompt: String
    public let answer: String
    public let sentence: String?

    public var noteKind: NoteEditKind? {
        guard let sentence, !sentence.isEmpty else { return nil }

        return NoteEditKind(cardKind: kind)
    }

    public var kindLabel: String { CardKind.label(kind) }

    public var displayPrompt: String { CardKind.displayPrompt(kind: kind, prompt: prompt) }

    public var face: CardFace { CardFace.make(context: context, prompt: displayPrompt) }
}

public struct PendingReviewCountResponse: Decodable, Sendable {
    public let count: Int
    public let attentionCount: Int
    public let inboxCount: Int

    private enum CodingKeys: String, CodingKey {
        case count, attentionCount, inboxCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        count = try container.decode(Int.self, forKey: .count)
        attentionCount = try container.decodeIfPresent(Int.self, forKey: .attentionCount) ?? 0
        inboxCount = try container.decodeIfPresent(Int.self, forKey: .inboxCount) ?? 0
    }
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
        PendingReviewSource(knowledgeSourceId: knowledgeSourceId, sourceText: sourceText, subjectName: subjectName, bits: bits, subjectId: subjectId, suggestedSubjectId: suggestedSubjectId, suggestedSubjectName: suggestedSubjectName, suggestedSubjectConfidence: suggestedSubjectConfidence, attention: attention, rejectReasonCodes: rejectReasonCodes)
    }

    public var subjectSuggestion: (id: String, name: String)? {
        guard let suggestedSubjectId, let suggestedSubjectName, suggestedSubjectId != subjectId else { return nil }

        return (suggestedSubjectId, suggestedSubjectName)
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
    public let rejectReasonCodes: [String]?

    public init(
        sourceId: String,
        sourceText: String?,
        subjectName: String?,
        index: Int,
        bit: PendingReviewBit,
        rejectReasonCodes: [String]? = nil
    ) {
        self.rejectReasonCodes = rejectReasonCodes
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
