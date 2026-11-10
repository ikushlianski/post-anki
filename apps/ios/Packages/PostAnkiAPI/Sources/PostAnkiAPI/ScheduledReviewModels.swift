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

    public init(again: Int, hard: Int, good: Int, easy: Int) {
        self.again = again
        self.hard = hard
        self.good = good
        self.easy = easy
    }
}

public struct ReviewCounts: Codable, Hashable, Sendable {
    public let new: Int
    public let learning: Int
    public let review: Int

    public init(new: Int, learning: Int, review: Int) {
        self.new = new
        self.learning = learning
        self.review = review
    }
}

public struct ReviewCard: Codable, Identifiable, Hashable, Sendable {
    public let variantId: String
    public let knowledgeBitId: String
    public let kind: String
    public let context: String?
    public let prompt: String
    public let answer: String
    public let sentence: String?
    public let background: String?
    public let phase: String
    public let leech: Bool
    public let intervalPreview: IntervalPreview
    public let cardKey: String?
    public let aiSuggestion: String?
    public let originalPhrase: String?
    public var isRehearsal = false

    private enum CodingKeys: String, CodingKey {
        case variantId, knowledgeBitId, kind, context, prompt, answer, sentence, background, phase, leech
        case intervalPreview, cardKey, aiSuggestion, originalPhrase
    }

    public var asRehearsal: ReviewCard {
        var copy = self
        copy.isRehearsal = true

        return copy
    }

    public var id: String { variantId }

    public var face: CardFace {
        CardFace.make(context: context, prompt: CardKind.displayPrompt(kind: kind, prompt: prompt))
    }

    public var isIndependentCard: Bool { !(cardKey ?? "").isEmpty }

    public var noteKind: NoteEditKind? {
        guard let sentence, !sentence.isEmpty else { return nil }

        return NoteEditKind(cardKind: kind)
    }

    public var filledSentence: String? {
        guard kind == "cloze", let sentence, !sentence.isEmpty else { return nil }

        return CardKind.fillClozeNote(sentence)
    }

    public init(
        variantId: String,
        knowledgeBitId: String,
        kind: String,
        context: String? = nil,
        prompt: String,
        answer: String,
        sentence: String? = nil,
        background: String?,
        phase: String,
        leech: Bool,
        intervalPreview: IntervalPreview,
        cardKey: String? = nil,
        aiSuggestion: String? = nil,
        originalPhrase: String? = nil
    ) {
        self.variantId = variantId
        self.knowledgeBitId = knowledgeBitId
        self.kind = kind
        self.context = context
        self.prompt = prompt
        self.answer = answer
        self.sentence = sentence
        self.background = background
        self.phase = phase
        self.leech = leech
        self.intervalPreview = intervalPreview
        self.cardKey = cardKey
        self.aiSuggestion = aiSuggestion
        self.originalPhrase = originalPhrase
    }
}

public struct ReviewCardsResponse: Codable, Sendable {
    public let cards: [ReviewCard]
    public let counts: ReviewCounts
    public let newRemainingToday: Int
    public let nextDueAt: String?
    public let limitReached: Bool?
    public let reviewedToday: Int?
    public let limit: Int?
}

public struct RecordReviewInput: Encodable, Sendable {
    public let variantId: String
    public let grade: ReviewGrade
    public let durationMs: Int?
    public let requestId: String?
    public let tz: String?
    public let burySiblings: Bool?
    public let rehearsal: Bool?
    public let reviewedAt: String?
    public let sentAt: String?

    public init(
        variantId: String,
        grade: ReviewGrade,
        durationMs: Int?,
        requestId: String?,
        tz: String? = nil,
        burySiblings: Bool? = nil,
        rehearsal: Bool? = nil,
        reviewedAt: String? = nil,
        sentAt: String? = nil
    ) {
        self.variantId = variantId
        self.grade = grade
        self.durationMs = durationMs
        self.requestId = requestId
        self.tz = tz
        self.burySiblings = burySiblings
        self.rehearsal = rehearsal
        self.reviewedAt = reviewedAt
        self.sentAt = sentAt
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
    public let cardKey: String?
    public let buriedVariantIds: [String]?
    public let followUp: ReviewCard?
    public let superseded: Bool?
}

public struct UndoReviewResult: Codable, Sendable {
    public let knowledgeBitId: String
    public let variantId: String?
    public let cardKey: String?
    public let unburiedVariantIds: [String]?
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
