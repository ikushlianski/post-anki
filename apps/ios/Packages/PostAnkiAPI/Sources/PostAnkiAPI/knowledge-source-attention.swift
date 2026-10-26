import Foundation

public enum KnowledgeSourceAttentionKind: String, Decodable, Sendable {
    case failed
    case emptyResult = "empty_result"
    case stuck
    case rateLimited = "rate_limited"
}

public struct KnowledgeSourceAttention: Decodable, Sendable, Hashable {
    public let knowledgeSourceId: String
    public let kind: KnowledgeSourceAttentionKind
    public let reason: String?
    public let firstWords: String
    public let sourceText: String?
    public let since: String

    public init(
        knowledgeSourceId: String,
        kind: KnowledgeSourceAttentionKind,
        reason: String?,
        firstWords: String,
        sourceText: String?,
        since: String
    ) {
        self.knowledgeSourceId = knowledgeSourceId
        self.kind = kind
        self.reason = reason
        self.firstWords = firstWords
        self.sourceText = sourceText
        self.since = since
    }

    private enum CodingKeys: String, CodingKey {
        case knowledgeSourceId, kind, reason, firstWords, sourceText, since
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        knowledgeSourceId = try container.decode(String.self, forKey: .knowledgeSourceId)
        kind = (try? container.decode(KnowledgeSourceAttentionKind.self, forKey: .kind)) ?? .failed
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        firstWords = try container.decodeIfPresent(String.self, forKey: .firstWords) ?? ""
        sourceText = try container.decodeIfPresent(String.self, forKey: .sourceText)
        since = try container.decode(String.self, forKey: .since)
    }

    public var wording: String { AttentionWording.text(kind: kind, reason: reason) }

    public var isInformational: Bool { kind == .rateLimited }
}

public enum AttentionWording {
    public static let generic = "Something went wrong while reading this note. Retry usually fixes it."
    public static let stuck = "Still working after more than 20 minutes."
    public static let emptyResult = "The AI finished but found nothing to turn into a card."

    static let failureByReason: [String: String] = [
        "no_valid_items": "The AI could not produce a usable card from this note.",
        "wrong_language": "The AI wrote cards in a different language than your note.",
        "source_empty": "This note has no text.",
        "source_too_long": "This note is too long (over 50,000 characters). Split it and add the parts separately.",
        "source_chunk_missing": generic,
        "extraction_failed": generic,
        "workflow_executor_lost": generic,
        "knowledge_source_reclaimed": generic,
        "provider_rate_limited": "The AI service is busy. This note will be tried again, or retry in a few minutes."
    ]

    public static func text(kind: KnowledgeSourceAttentionKind, reason: String?) -> String {
        switch kind {
        case .stuck: return stuck
        case .emptyResult: return emptyResult
        case .failed, .rateLimited:
            guard let reason, let known = failureByReason[reason] else { return generic }

            return known
        }
    }

    public static func age(since: String, now: Date = Date()) -> String {
        guard let date = parse(since) else { return "just now" }

        let elapsed = now.timeIntervalSince(date)

        if elapsed < 60 { return "just now" }

        if elapsed < 3600 { return plural(Int(elapsed / 60), "minute") }

        if elapsed < 86_400 { return plural(Int(elapsed / 3600), "hour") }

        return plural(Int(elapsed / 86_400), "day")
    }

    private static func plural(_ count: Int, _ unit: String) -> String {
        "\(count) \(unit)\(count == 1 ? "" : "s") ago"
    }

    private static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()

        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = fractional.date(from: value) { return date }

        return ISO8601DateFormatter().date(from: value)
    }
}
