import Foundation

public enum RejectedCardReason: String, CaseIterable, Sendable, Identifiable {
    case questionBentToAnswer = "question_bent_to_answer"
    case restatesSourceNoValue = "restates_source_no_value"
    case textRecallOnly = "text_recall_only"
    case wrongLanguage = "wrong_language"
    case tooVagueOrNoContext = "too_vague_or_no_context"
    case metaWording = "meta_wording"
    case notAFactOrTrivial = "not_a_fact_or_trivial"
    case wrongOrUnsupportedAnswer = "wrong_or_unsupported_answer"
    case duplicateOrOverlap = "duplicate_or_overlap"
    case badFormat = "bad_format"
    case other = "other"
    case unspecified = "unspecified"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .questionBentToAnswer: return "Question doesn't make sense, bent to fit the answer"
        case .restatesSourceNoValue: return "Just restates the text, no practical value"
        case .textRecallOnly: return "Only checks the text's wording, not understanding"
        case .wrongLanguage: return "Wrong language"
        case .tooVagueOrNoContext: return "Too vague or no context"
        case .metaWording: return "Meta wording (\"according to the text\")"
        case .notAFactOrTrivial: return "Not a fact or trivial"
        case .wrongOrUnsupportedAnswer: return "Wrong or unsupported answer"
        case .duplicateOrOverlap: return "Duplicate or overlaps another"
        case .badFormat: return "Bad format (broken blank, yes/no)"
        case .other: return "Other"
        case .unspecified: return "No reason given"
        }
    }

    public static func label(forCode code: String) -> String {
        RejectedCardReason(rawValue: code)?.label ?? RejectReason(rawValue: code)?.label ?? RejectReason.unknownLabel
    }
}

public struct RejectedCard: Decodable, Sendable, Identifiable, Hashable {
    public let knowledgeBitId: String
    public let body: String
    public let reasonCode: String
    public let decidedAt: String
    public let note: String?
    public let sourceTitle: String?
    public let sourceUrl: String?

    public var id: String { knowledgeBitId }

    public var reasonLabel: String { RejectedCardReason.label(forCode: reasonCode) }

    public var sourceTitleText: String? {
        guard let title = sourceTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else { return nil }

        return title
    }

    public var noteText: String? {
        guard let text = note?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }

        return text
    }

    public var sourceLink: URL? {
        guard
            let raw = sourceUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
            let url = URL(string: raw),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            url.host?.isEmpty == false
        else { return nil }

        return url
    }

    public init(
        knowledgeBitId: String,
        body: String,
        reasonCode: String,
        decidedAt: String,
        note: String? = nil,
        sourceTitle: String? = nil,
        sourceUrl: String? = nil
    ) {
        self.note = note
        self.sourceTitle = sourceTitle
        self.sourceUrl = sourceUrl
        self.knowledgeBitId = knowledgeBitId
        self.body = body
        self.reasonCode = reasonCode
        self.decidedAt = decidedAt
    }
}

public struct RejectedCardsPage: Decodable, Sendable {
    public let items: [RejectedCard]
    public let hasMore: Bool
    public let reasonCounts: [String: Int]?

    public init(items: [RejectedCard], hasMore: Bool, reasonCounts: [String: Int]? = nil) {
        self.items = items
        self.hasMore = hasMore
        self.reasonCounts = reasonCounts
    }
}

public struct RejectedReasonCounts: Sendable, Equatable {
    private let counts: [String: Int]

    public init?(_ counts: [String: Int]?) {
        guard let counts else { return nil }

        self.counts = counts
    }

    public var total: Int { counts.values.reduce(0) { $0 + max(0, $1) } }

    public func count(for reason: RejectedCardReason) -> Int { max(0, counts[reason.rawValue] ?? 0) }

    public static func allTitle(_ counts: RejectedReasonCounts?) -> String {
        title("All reasons", count: counts?.total)
    }

    public static func chipTitle(_ reason: RejectedCardReason, counts: RejectedReasonCounts?) -> String {
        title(reason.label, count: counts?.count(for: reason))
    }

    private static func title(_ base: String, count: Int?) -> String {
        guard let count else { return base }

        return "\(base) (\(count))"
    }
}
