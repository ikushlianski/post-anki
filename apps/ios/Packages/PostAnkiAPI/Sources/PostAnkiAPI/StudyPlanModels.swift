import Foundation

public enum StudyIntent: String, Codable, Sendable, CaseIterable {
    case exam
    case longTerm = "long_term"
}

public enum ComplexityLevel: String, Codable, Sendable, CaseIterable, Identifiable {
    case easy
    case normal
    case cram

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .easy: return "Easy"
        case .normal: return "Normal"
        case .cram: return "Cram"
        }
    }
}

public enum ComplexityChoice {
    public static func shown(_ selection: ComplexityLevel?, hasParent: Bool) -> ComplexityLevel? {
        hasParent ? selection : (selection ?? .normal)
    }

    public static func toSend(_ selection: ComplexityLevel?, hasParent: Bool) -> ComplexityLevel? {
        hasParent ? selection : (selection == .normal ? nil : selection)
    }
}

public struct SubjectStudyOptions: Decodable, Sendable, Equatable {
    public struct Own: Decodable, Sendable, Equatable {
        public let newCardsPerDay: Int?
        public let maxReviewsPerDay: Int?
        public let learningStepsMinutes: [Int]?
        public let relearningStepsMinutes: [Int]?
        public let desiredRetention: Double?
        public var complexityLevel: ComplexityLevel?
        public let studyIntent: StudyIntent?
        public let examDate: String?
        public var detailLevel: DetailLevel?
        public var hintingEnabled: Bool?
    }

    public struct IntentInfo: Decodable, Sendable, Equatable {
        public let studyIntent: StudyIntent
        public let examDate: String?
        public let source: String
    }

    public struct Effective: Decodable, Sendable, Equatable {
        public let newCardsPerDay: Int
        public let maxReviewsPerDay: Int?
        public let learningStepsMinutes: [Int]
        public let relearningStepsMinutes: [Int]
        public let desiredRetention: Double
    }

    public struct Sources: Decodable, Sendable, Equatable {
        public let newCardsPerDay: String
        public let maxReviewsPerDay: String?
        public let learningStepsMinutes: String
        public let relearningStepsMinutes: String
        public let desiredRetention: String
    }

    public struct Complexity: Decodable, Sendable, Equatable {
        public let level: String
        public let source: String
    }

    public struct Preview: Decodable, Sendable, Equatable {
        public let goodDays: Int
        public let easyDays: Int
    }

    public let own: Own
    public let intent: IntentInfo
    public let effective: Effective
    public let sources: Sources
    public var complexity: Complexity?
    public var preview: Preview?
}

public struct StudyForecast: Decodable, Sendable, Equatable {
    public struct NewCards: Decodable, Sendable, Equatable {
        public let perDay: Int
        public let paced: Bool
        public let pausedToday: Bool
        public let pauseThreshold: Int
        public let remaining: Int
        public let finishOn: String?
        public let finishesBeforeExam: Bool?
    }

    public struct Reviews: Decodable, Sendable, Equatable {
        public let dueToday: Int
        public let averagePerDay: Double
        public let peakPerDay: Int
        public let peakOn: String?
        public let horizonDays: Int
    }

    public struct Day: Decodable, Sendable, Equatable, Identifiable {
        public let date: String
        public let reviews: Int
        public let newCards: Int

        public var id: String { date }

        public init(date: String, reviews: Int, newCards: Int) {
            self.date = date
            self.reviews = reviews
            self.newCards = newCards
        }
    }

    public let intent: StudyIntent
    public let examDate: String?
    public let daysLeft: Int?
    public let examPassed: Bool
    public let desiredRetention: Double
    public let recentRetention: Double?
    public let maxIntervalDays: Int
    public let hasCards: Bool
    public let newCards: NewCards
    public let reviews: Reviews
    public let days: [Day]
}

public enum StudyOptionChange<Value: Encodable & Sendable & Equatable>: Sendable, Equatable {
    case unchanged
    case inherit
    case set(Value)
}

public struct SubjectStudyOptionsUpdate: Encodable, Sendable, Equatable {
    public var studyIntent: StudyOptionChange<StudyIntent> = .unchanged
    public var examDate: StudyOptionChange<String> = .unchanged
    public var newCardsPerDay: StudyOptionChange<Int> = .unchanged
    public var maxReviewsPerDay: StudyOptionChange<Int> = .unchanged
    public var desiredRetention: StudyOptionChange<Double> = .unchanged
    public var complexityLevel: StudyOptionChange<ComplexityLevel> = .unchanged
    public var detailLevel: StudyOptionChange<DetailLevel> = .unchanged
    public var hintingEnabled: StudyOptionChange<Bool> = .unchanged

    public init() {}

    public var isEmpty: Bool {
        studyIntent == .unchanged && examDate == .unchanged
            && newCardsPerDay == .unchanged && maxReviewsPerDay == .unchanged && desiredRetention == .unchanged
            && complexityLevel == .unchanged && detailLevel == .unchanged && hintingEnabled == .unchanged
    }

    enum CodingKeys: String, CodingKey {
        case studyIntent, examDate, newCardsPerDay, maxReviewsPerDay, desiredRetention, complexityLevel, detailLevel, hintingEnabled
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try Self.write(studyIntent, .studyIntent, to: &container)
        try Self.write(examDate, .examDate, to: &container)
        try Self.write(newCardsPerDay, .newCardsPerDay, to: &container)
        try Self.write(maxReviewsPerDay, .maxReviewsPerDay, to: &container)
        try Self.write(desiredRetention, .desiredRetention, to: &container)
        try Self.write(complexityLevel, .complexityLevel, to: &container)
        try Self.write(detailLevel, .detailLevel, to: &container)
        try Self.write(hintingEnabled, .hintingEnabled, to: &container)
    }

    private static func write<V: Encodable & Sendable & Equatable>(
        _ change: StudyOptionChange<V>,
        _ key: CodingKeys,
        to container: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        switch change {
        case .unchanged: break
        case .inherit: try container.encodeNil(forKey: key)
        case .set(let value): try container.encode(value, forKey: key)
        }
    }
}
