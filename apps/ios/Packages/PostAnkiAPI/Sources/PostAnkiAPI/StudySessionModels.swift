import Foundation

public struct StudySession: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let targetType: String?
    public let targetId: String?
    public let plannedDurationMinutes: Int
    public let scheduledFor: String?
    public let status: String
    public let startedAt: String?
    public let completedAt: String?
    public let questionsAnswered: Int
    public let questionsCorrect: Int
}

public struct StudySessionListItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let targetType: String?
    public let targetId: String?
    public let plannedDurationMinutes: Int
    public let scheduledFor: String?
    public let status: String
    public let startedAt: String?
    public let completedAt: String?
    public let questionsAnswered: Int
    public let questionsCorrect: Int
    public let missed: Bool
}

public struct StudySessionConsistency: Decodable, Sendable, Hashable {
    public let planned: Int
    public let completed: Int
    public let rate: Double
}

public struct CreateStudySessionInput: Encodable, Sendable {
    public var targetType: String?
    public var targetId: String?
    public let plannedDurationMinutes: Int
    public var scheduledFor: String?

    public init(
        targetType: String? = nil,
        targetId: String? = nil,
        plannedDurationMinutes: Int,
        scheduledFor: String? = nil
    ) {
        self.targetType = targetType
        self.targetId = targetId
        self.plannedDurationMinutes = plannedDurationMinutes
        self.scheduledFor = scheduledFor
    }
}

public struct StudyPushGap: Decodable, Sendable, Hashable {
    public let id: String
    public let label: String
}

public struct StudyPushTarget: Decodable, Sendable, Hashable {
    public let topicId: String
    public let topicTitle: String
    public let curriculumId: String
    public let curriculumName: String
    public let gap: StudyPushGap
    public let reason: String
}

public struct StudyPushQuestion: Decodable, Sendable, Hashable {
    public let gapId: String?
    public let gapLabel: String?
    public let kind: String
    public let prompt: String
    public let options: [String]?
    public let correctAnswerIndex: Int?
}

public struct StudySessionPush: Decodable, Sendable, Hashable {
    public let push: StudyPushTarget?
    public let question: StudyPushQuestion?
}

public struct TopicProbeAnswerInput: Encodable, Sendable {
    public let gapId: String?
    public var mode = "socratic"
    public let answer: String
    public var selfOutcome: String?

    private enum CodingKeys: String, CodingKey {
        case gapId, mode, answer, selfOutcome
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(gapId, forKey: .gapId)
        try container.encode(mode, forKey: .mode)
        try container.encode(answer, forKey: .answer)
        try container.encodeIfPresent(selfOutcome, forKey: .selfOutcome)
    }
}

public struct TopicProbeResult: Decodable, Sendable, Hashable {
    public let outcome: String
    public let coveredGapLabels: [String]
    public let feedback: String
}

public struct RecordSessionAnswerInput: Encodable, Sendable {
    public let correct: Bool
}

public struct EndStudySessionInput: Encodable, Sendable {
    public let userRequestedEnd: Bool
}

public enum StudySessionDates: Sendable {
    public nonisolated static func parse(_ iso: String?) -> Date? {
        guard let iso else { return nil }

        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]

        return withFraction.date(from: iso) ?? plain.date(from: iso)
    }

    public nonisolated static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        return formatter.string(from: date)
    }
}
