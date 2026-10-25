import Foundation

public struct KnowledgeOverviewItem: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeBitId: String
    public let question: String
    public let answer: String
    public let subjectId: String?
    public var state: String
    public let dueAt: String?
    public let lapses: Int

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
        lapses: Int
    ) {
        self.knowledgeBitId = knowledgeBitId
        self.question = question
        self.answer = answer
        self.subjectId = subjectId
        self.state = state
        self.dueAt = dueAt
        self.lapses = lapses
    }
}

public struct KnowledgeOverviewPage: Decodable, Sendable {
    public let items: [KnowledgeOverviewItem]
    public let hasMore: Bool
}

public struct SuspendedKnowledgeItem: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeBitId: String
    public let itemText: String
    public let question: String
    public let answer: String
    public let subjectName: String?
    public let reason: String
    public let lapses: Int
    public let suspended: Bool
    public let buriedUntil: String?
    public let since: String?

    public var id: String { knowledgeBitId }
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
}

public struct EditVariantResult: Decodable, Sendable {
    public let ok: Bool
    public let variantId: String
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
    public let prompt: String
    public let answer: String
}

public struct ScheduleControlInput: Encodable, Sendable {
    public let suspended: Bool?
    public let buried: Bool?
    public let tz: String
}

public struct RejectFeedbackInput: Encodable, Sendable {
    public let reasonCode: String
    public let note: String?
}

public enum RejectReason: String, CaseIterable, Sendable, Identifiable {
    case wrongLanguage = "wrong_language"
    case tooVague = "too_vague_or_no_context"
    case metaWording = "meta_wording"
    case notAFact = "not_a_fact_or_trivial"
    case wrongAnswer = "wrong_or_unsupported_answer"
    case duplicate = "duplicate_or_overlap"
    case badFormat = "bad_format"
    case other = "other"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .wrongLanguage: return "Wrong language"
        case .tooVague: return "Too vague or missing context"
        case .metaWording: return "Meta wording"
        case .notAFact: return "Not a fact, or trivial"
        case .wrongAnswer: return "Wrong or unsupported answer"
        case .duplicate: return "Duplicate or overlapping"
        case .badFormat: return "Bad format"
        case .other: return "Other"
        }
    }
}

public struct PendingRejectFeedback: Identifiable, Sendable {
    public let feedbackId: String
    public let bitBody: String

    public var id: String { feedbackId }

    public init(
        feedbackId: String,
        bitBody: String
    ) {
        self.feedbackId = feedbackId
        self.bitBody = bitBody
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
