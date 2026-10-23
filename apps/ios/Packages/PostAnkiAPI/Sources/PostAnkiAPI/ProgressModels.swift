import Foundation

public struct TopSubject: Decodable, Sendable, Hashable, Identifiable {
    public let subjectId: String
    public let subjectName: String
    public let lastInteractedAt: String
    public let topicsTouchedLast30Days: Int

    public var id: String { subjectId }
}

public struct HomeFunStats: Decodable, Sendable, Hashable {
    public let currentStreak: Int
    public let longestStreak: Int
    public let topicsMastered: Int
    public let questionsAnswered: Int
}

public struct HomeSummary: Decodable, Sendable, Hashable {
    public let topSubjects: [TopSubject]
    public let funStats: HomeFunStats
}

public struct Streak: Decodable, Sendable, Hashable {
    public let currentStreak: Int
    public let longestStreak: Int
    public let lastActiveDate: String?

    public var isActiveToday: Bool {
        guard let lastActiveDate else { return false }

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"

        return formatter.string(from: Date()) == lastActiveDate
    }
}

public struct Milestone: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let entityType: String
    public let entityId: String
    public let entityLabel: String?
    public let criteriaKey: String
    public let achievedAt: String
    public let createdAt: String

    public var kindLabel: String {
        switch entityType {
        case "curriculum": return "Course mastered"
        case "domain_node": return "Area mastered"
        default: return "Milestone"
        }
    }
}

public struct RetentionSummary: Decodable, Sendable, Hashable {
    public let count: Int
    public let avgRate: Double
    public let medianRate: Double

    public var percentText: String { "\(Int((avgRate * 100).rounded()))%" }
    public var medianPercentText: String { "\(Int((medianRate * 100).rounded()))%" }
}

public struct TimeToMasterySummary: Decodable, Sendable, Hashable {
    public let count: Int
    public let avgHours: Double
    public let medianHours: Double

    public var hoursText: String { String(format: "%.1f h", avgHours) }
    public var medianHoursText: String { String(format: "%.1f h", medianHours) }
}

public struct RetentionReport: Decodable, Sendable, Hashable {
    public let overall: RetentionSummary?
    public let timeToMasteryOverall: TimeToMasterySummary?
}

public struct CoverageArea: Decodable, Sendable, Hashable, Identifiable {
    public let domainNodeId: String
    public let name: String
    public let subjectName: String
    public let percent: Int
    public let status: String

    public var id: String { domainNodeId }
}

public struct ConcernSummary: Decodable, Sendable, Hashable, Identifiable {
    public let concern: String
    public let open: Int
    public let covered: Int
    public let total: Int

    public var id: String { concern }

    public var label: String {
        let text = concern.replacingOccurrences(of: "_", with: " ")

        return text.prefix(1).uppercased() + text.dropFirst()
    }
}

public struct WeeklyDigest: Decodable, Sendable, Hashable {
    public let windowDays: Int
    public let timeToMastery: TimeToMasterySummary?
    public let retention: RetentionSummary?
    public let coverage: [CoverageArea]
    public let concerns: [ConcernSummary]
    public let streak: Streak

    public var averageCoverage: Int? {
        guard !coverage.isEmpty else { return nil }

        return coverage.map(\.percent).reduce(0, +) / coverage.count
    }
}

public struct WeakSpot: Decodable, Sendable, Hashable, Identifiable {
    public let topicId: String
    public let topicTitle: String
    public let maturity: Int
    public let openGapLabels: [String]

    public var id: String { topicId }
}

public struct StrongPoint: Decodable, Sendable, Hashable, Identifiable {
    public let topicId: String
    public let topicTitle: String
    public let maturity: Int

    public var id: String { topicId }
}

public struct TopicRecommendation: Decodable, Sendable, Hashable, Identifiable {
    public let topicId: String
    public let text: String
    public let citations: [String]
    public let generatedAt: String

    public var id: String { topicId + generatedAt }
}

public struct NextStep: Decodable, Sendable, Hashable {
    public let kind: String
    public let topicId: String
    public let level: String?
}

public struct CurriculumStats: Decodable, Sendable, Hashable {
    public let curriculumId: String
    public let attemptedTopicCount: Int
    public let weakSpots: [WeakSpot]
    public let strongPoints: [StrongPoint]
    public let recommendationsEligible: Bool
    public let recommendations: [TopicRecommendation]
    public let nextStep: NextStep?
}

public enum ProgressLoadError: Sendable, Hashable {
    case offline
    case unauthorized
    case notFound
    case other

    public static func from(_ error: Error) -> ProgressLoadError? {
        if error is CancellationError { return nil }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled:
                return nil
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost:
                return .offline
            default:
                return .other
            }
        }

        if case APIError.unauthorized = error { return .unauthorized }

        if case APIError.badStatus(404, _) = error { return .notFound }

        return .other
    }

    public var message: String {
        switch self {
        case .offline: return "You're offline. Pull to refresh when you're back."
        case .unauthorized: return "Add your access token in Settings."
        case .notFound: return "Stats aren't available for this course."
        case .other: return "Couldn't load your progress."
        }
    }
}
