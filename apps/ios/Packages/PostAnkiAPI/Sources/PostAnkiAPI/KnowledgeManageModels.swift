import Foundation

public struct KnowledgeOverviewItem: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeBitId: String
    public let question: String
    public let answer: String
    public let subjectId: String?
    public var state: String
    public let dueAt: String?
    public let lapses: Int
    public let createdAt: String?

    public var id: String { knowledgeBitId }

    public var stateLabel: String {
        switch state {
        case "new": return "New"
        case "learning": return "Learning"
        case "review": return "Review"
        case "relearning": return "Relearning"
        case "suspended": return "Suspended"
        case "buried": return "Buried"
        default: return state.capitalized
        }
    }

    public init(
        knowledgeBitId: String,
        question: String,
        answer: String,
        subjectId: String?,
        state: String,
        dueAt: String?,
        lapses: Int,
        createdAt: String? = nil
    ) {
        self.knowledgeBitId = knowledgeBitId
        self.question = question
        self.answer = answer
        self.subjectId = subjectId
        self.state = state
        self.dueAt = dueAt
        self.lapses = lapses
        self.createdAt = createdAt
    }
}

public struct KnowledgeOverviewPage: Decodable, Sendable {
    public let items: [KnowledgeOverviewItem]
    public let hasMore: Bool
}

public struct SuspendedKnowledgeItem: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeBitId: String
    public let variantId: String?
    public let cardKey: String?
    public let itemText: String
    public let question: String
    public let answer: String
    public let subjectName: String?
    public let reason: String
    public let lapses: Int
    public let suspended: Bool
    public let buriedUntil: String?
    public let since: String?

    public var cardLabel: String? { CardSlotLabel.title(cardKey: cardKey) }

    public var id: String {
        guard let variantId, !variantId.isEmpty else { return knowledgeBitId }

        return "\(knowledgeBitId):\(variantId)"
    }
}

public struct SuspendedKnowledgePage: Decodable, Sendable {
    public let items: [SuspendedKnowledgeItem]
    public let hasMore: Bool
}

public struct KnowledgeBulkSkip: Decodable, Sendable {
    public let id: String
    public let reason: String
}

public struct KnowledgeBulkDeleteResult: Decodable, Sendable {
    public let deleted: [String]
    public let skipped: [KnowledgeBulkSkip]
}

public struct KnowledgeBulkMoveResult: Decodable, Sendable {
    public let moved: [String]
    public let skipped: [KnowledgeBulkSkip]
}

public struct ScheduleControlResult: Decodable, Sendable {
    public let knowledgeBitId: String
    public let suspended: Bool
    public let buriedUntil: String?
    public let leech: Bool
    public let cardKey: String?
}

public enum CardSlotLabel {
    public static func title(kind: String, order: Int) -> String {
        switch kind {
        case "cloze": return "Cloze c\(order)"
        case "list_overview": return CardKind.label(kind)
        default: return "\(CardKind.label(kind)) \(order)"
        }
    }

    public static func title(cardKey: String?) -> String? {
        guard let cardKey, !cardKey.isEmpty else { return nil }

        let parts = cardKey.split(separator: ":")

        guard parts.count == 2, let order = Int(parts[1]) else { return nil }

        return title(kind: String(parts[0]), order: order)
    }
}

public struct KnowledgeCardState: Decodable, Sendable, Identifiable, Hashable {
    public let variantId: String
    public let cardKey: String
    public let kind: String
    public let order: Int
    public let state: String
    public let dueAt: String?
    public let lapses: Int
    public let suspended: Bool
    public let buried: Bool

    public var id: String { variantId }

    public var title: String { CardSlotLabel.title(kind: kind, order: order) }
}

public struct KnowledgeDetail: Decodable, Sendable {
    public let knowledgeBitId: String
    public let cards: [KnowledgeCardState]?

    public var perCardStates: [KnowledgeCardState] { cards ?? [] }
}

public struct EditedVariantCard: Decodable, Sendable, Equatable {
    public let id: String
    public let context: String?
    public let prompt: String
    public let answer: String
}

public struct EditVariantResult: Decodable, Sendable {
    public let ok: Bool
    public let variantId: String
    public let cards: [EditedVariantCard]?

    public var editedCard: EditedVariantCard? { cards?.first { $0.id == variantId } }
}

public struct RejectKnowledgeBitResult: Decodable, Sendable {
    public let ok: Bool
    public let feedbackId: String?
}

public struct KnowledgeBitIdsInput: Encodable, Sendable {
    public let knowledgeBitIds: [String]
}

public struct MoveKnowledgeBitsInput: Encodable, Sendable {
    public let knowledgeBitIds: [String]
    public let subjectId: String
}

public struct EditKnowledgeBitInput: Encodable, Sendable {
    public let body: String
    public let background: String?

    enum CodingKeys: String, CodingKey { case body, background }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(body, forKey: .body)
        try container.encode(background, forKey: .background)
    }
}

public struct EditVariantInput: Encodable, Sendable {
    public let context: String?
    public let prompt: String
    public let answer: String

    enum CodingKeys: String, CodingKey { case context, prompt, answer }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encodeIfPresent(context, forKey: .context)
        try container.encode(prompt, forKey: .prompt)
        try container.encode(answer, forKey: .answer)
    }
}

public struct ScheduleControlInput: Encodable, Sendable {
    public let suspended: Bool?
    public let buried: Bool?
    public let tz: String
    public let variantId: String?
}

public struct RejectFeedbackInput: Encodable, Sendable {
    public let reasonCode: String
    public let note: String?
}

public enum RejectReason: String, CaseIterable, Sendable, Identifiable {
    case questionBentToAnswer = "question_bent_to_answer"
    case restatesSourceNoValue = "restates_source_no_value"
    case textRecallOnly = "text_recall_only"
    case wrongAnswer = "wrong_or_unsupported_answer"
    case wrongLanguage = "wrong_language"
    case duplicate = "duplicate_or_overlap"
    case other = "other"
    case tooVague = "too_vague_or_no_context"
    case metaWording = "meta_wording"
    case notAFact = "not_a_fact_or_trivial"
    case badFormat = "bad_format"
    case frontUnclearTargetPhrase = "front_unclear_target_phrase"
    case noCodeContext = "no_code_context"
    case tooTrivial = "too_trivial"
    case outdatedApi = "outdated_api"

    public var id: String { rawValue }

    public static let selectable: [RejectReason] = [
        .questionBentToAnswer, .restatesSourceNoValue, .textRecallOnly,
        .wrongAnswer, .wrongLanguage, .duplicate, .other
    ]

    public static let legacy: [RejectReason] = [.tooVague, .metaWording, .notAFact, .badFormat]

    public static let subjectSpecific: [RejectReason] = [.frontUnclearTargetPhrase, .noCodeContext, .tooTrivial, .outdatedApi]

    public static let unknownLabel = "Other reason"

    public var isSelectable: Bool { Self.selectable.contains(self) }

    public static func label(forCode code: String?) -> String? {
        guard let code else { return nil }

        return RejectReason(rawValue: code)?.label ?? unknownLabel
    }

    public var label: String {
        switch self {
        case .questionBentToAnswer: return "Question doesn't make sense, bent to fit the answer"
        case .restatesSourceNoValue: return "Just restates the text, no practical value"
        case .textRecallOnly: return "Only checks the text's wording, not understanding"
        case .wrongAnswer: return "Wrong or unsupported answer"
        case .wrongLanguage: return "Wrong language"
        case .duplicate: return "Duplicate or overlapping"
        case .other: return "Other"
        case .tooVague: return "Too vague or missing context"
        case .metaWording: return "Meta wording"
        case .notAFact: return "Not a fact, or trivial"
        case .badFormat: return "Bad format"
        case .frontUnclearTargetPhrase: return "Front doesn't make clear which phrase the answer should be"
        case .noCodeContext: return "No code context"
        case .tooTrivial: return "Too trivial"
        case .outdatedApi: return "Outdated API"
        }
    }
}

public struct RejectReasonOption: Sendable, Identifiable, Hashable {
    public let code: String
    public let label: String

    public var id: String { code }

    public init(code: String) {
        self.code = code
        label = RejectReason(rawValue: code)?.label ?? Self.humanized(code)
    }

    static func humanized(_ code: String) -> String {
        let words = code.replacingOccurrences(of: "_", with: " ").trimmingCharacters(in: .whitespaces)

        guard let first = words.first else { return RejectReason.unknownLabel }

        return first.uppercased() + words.dropFirst()
    }

    public static func options(forCodes codes: [String]?) -> [RejectReasonOption] {
        let source = (codes?.isEmpty ?? true) ? RejectReason.selectable.map(\.rawValue) : codes ?? []
        var seen = Set<String>()

        return source.filter { seen.insert($0).inserted }.map(RejectReasonOption.init(code:))
    }
}

public struct PendingRejectFeedback: Identifiable, Sendable {
    public let feedbackId: String
    public let bitBody: String
    public let reasonCodes: [String]?

    public var id: String { feedbackId }

    public var options: [RejectReasonOption] { RejectReasonOption.options(forCodes: reasonCodes) }

    public init(
        feedbackId: String,
        bitBody: String,
        reasonCodes: [String]? = nil
    ) {
        self.feedbackId = feedbackId
        self.bitBody = bitBody
        self.reasonCodes = reasonCodes
    }
}

extension KnowledgeBulkDeleteResult {
    public func summary() -> String {
        var text = "Deleted \(deleted.count)."

        if !skipped.isEmpty {
            text += " Skipped \(skipped.count): \(KnowledgeBulkSkip.describe(skipped))."
        }

        return text
    }
}

extension KnowledgeBulkMoveResult {
    public func summary() -> String {
        var text = "Moved \(moved.count)."

        if !skipped.isEmpty {
            text += " Skipped \(skipped.count): \(KnowledgeBulkSkip.describe(skipped))."
        }

        return text
    }
}

extension KnowledgeBulkSkip {
    public static func describe(_ skipped: [KnowledgeBulkSkip]) -> String {
        let labels: [(String, String)] = [
            ("not_found", "no longer exist"),
            ("not_approved", "not approved"),
            ("curriculum_placed", "placed in a course")
        ]
        var parts: [String] = []

        for (reason, label) in labels {
            let count = skipped.filter { $0.reason == reason }.count

            if count > 0 { parts.append("\(count) \(label)") }
        }

        let known = Set(labels.map(\.0))
        let other = skipped.filter { !known.contains($0.reason) }.count

        if other > 0 { parts.append("\(other) other") }

        return parts.joined(separator: ", ")
    }
}

public enum KnowledgeManageError: Sendable {
    public static func message(for error: Error, action: String) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost:
                return "Couldn't connect to the server. Nothing was changed, try again in a moment."
            default:
                break
            }
        }

        if let apiError = error as? APIError {
            switch apiError {
            case .unauthorized:
                return "Your access token was rejected. Check Settings."
            case .badStatus(404, "subject_not_found"):
                return "That subject no longer exists."
            case .badStatus(409, "subject_has_children"):
                return "Pick a sub-subject. Items can't go in a subject that has sub-subjects."
            case .badStatus(404, _), .badStatus(409, "blocked"):
                return "This item was changed elsewhere."
            case .badStatus(403, "not_approved"):
                return "This item isn't approved yet."
            default:
                break
            }
        }

        return "Couldn't \(action). Try again."
    }

    public static func isGone(_ error: Error) -> Bool {
        guard let apiError = error as? APIError else { return false }

        switch apiError {
        case .badStatus(404, _), .badStatus(409, "blocked"): return true
        default: return false
        }
    }

    public static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }

        return (error as? URLError)?.code == .cancelled
    }
}
