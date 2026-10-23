import Foundation

public enum ReviewGrade: String, Codable, CaseIterable, Sendable {
    case again
    case hard
    case good
    case easy
}

public struct IntervalPreview: Codable, Hashable, Sendable {
    public let again: Int
    public let hard: Int
    public let good: Int
    public let easy: Int
}

public struct ReviewCounts: Codable, Hashable, Sendable {
    public let new: Int
    public let learning: Int
    public let review: Int
}

public struct ReviewCard: Codable, Identifiable, Hashable, Sendable {
    public let variantId: String
    public let knowledgeBitId: String
    public let kind: String
    public let prompt: String
    public let answer: String
    public let background: String?
    public let phase: String
    public let leech: Bool
    public let intervalPreview: IntervalPreview

    public var id: String { variantId }

    public init(
        variantId: String,
        knowledgeBitId: String,
        kind: String,
        prompt: String,
        answer: String,
        background: String?,
        phase: String,
        leech: Bool,
        intervalPreview: IntervalPreview
    ) {
        self.variantId = variantId
        self.knowledgeBitId = knowledgeBitId
        self.kind = kind
        self.prompt = prompt
        self.answer = answer
        self.background = background
        self.phase = phase
        self.leech = leech
        self.intervalPreview = intervalPreview
    }
}

public struct ReviewCardsResponse: Codable, Sendable {
    public let cards: [ReviewCard]
    public let counts: ReviewCounts
    public let newRemainingToday: Int
    public let nextDueAt: String?
}

public struct RecordReviewInput: Encodable, Sendable {
    public let variantId: String
    public let grade: ReviewGrade
    public let durationMs: Int?
    public let requestId: String?

    public init(
        variantId: String,
        grade: ReviewGrade,
        durationMs: Int?,
        requestId: String?
    ) {
        self.variantId = variantId
        self.grade = grade
        self.durationMs = durationMs
        self.requestId = requestId
    }
}

public struct RecordReviewResult: Codable, Sendable {
    public let reviewId: String
    public let knowledgeBitId: String
    public let phase: String
    public let dueAt: String
    public let intervalDays: Double
    public let lapses: Int
    public let leech: Bool
    public let suspended: Bool
}

public struct UndoReviewResult: Codable, Sendable {
    public let knowledgeBitId: String
}

extension IntervalPreview {
    public func seconds(for grade: ReviewGrade) -> Int {
        switch grade {
        case .again: again
        case .hard: hard
        case .good: good
        case .easy: easy
        }
    }
}

public enum IntervalFormat: Sendable {
    public static func short(seconds: Int) -> String {
        let value = Double(seconds)

        if value < 60 { return "<1m" }
        if value < 3600 { return "\(Int((value / 60).rounded()))m" }
        if value < 86_400 { return "\(Int((value / 3600).rounded()))h" }

        let days = value / 86_400

        if days < 30 { return "\(Int(days.rounded()))d" }

        return "\(trimmed(days / 30))mo"
    }

    public static func spoken(seconds: Int) -> String {
        let value = Double(seconds)

        if value < 60 { return "less than a minute" }
        if value < 3600 { return plural(Int((value / 60).rounded()), "minute") }
        if value < 86_400 { return plural(Int((value / 3600).rounded()), "hour") }

        let days = value / 86_400

        if days < 30 { return plural(Int(days.rounded()), "day") }

        let months = trimmed(days / 30)

        return months == "1" ? "1 month" : "\(months) months"
    }

    private static func plural(_ count: Int, _ unit: String) -> String {
        count == 1 ? "1 \(unit)" : "\(count) \(unit)s"
    }

    private static func trimmed(_ months: Double) -> String {
        let rounded = (months * 10).rounded() / 10

        if rounded == rounded.rounded() { return String(Int(rounded)) }

        return String(rounded)
    }
}
