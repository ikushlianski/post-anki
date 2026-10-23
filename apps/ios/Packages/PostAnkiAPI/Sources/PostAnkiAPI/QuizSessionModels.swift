import Foundation

public struct QuizOptionExplanation: Decodable, Sendable, Hashable {
    public let text: String
    public let citationUrl: String?
}

public struct QuizQuestion: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let order: Int
    public let prompt: String
    public let options: [String]
    public let type: String
    public var answeredIndex: Int?
    public var answeredIndexes: [Int]?
    public var outcome: String?
    public var correctAnswerIndex: Int?
    public var correctAnswerIndexes: [Int]?
    public var optionExplanations: [QuizOptionExplanation]?

    public var isMulti: Bool { type == "multi" }
    public var isAnswered: Bool { answeredIndex != nil || !(answeredIndexes ?? []).isEmpty }
}

public struct QuizSession: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public var status: String
    public var total: Int
    public var correct: Int
    public var answered: Int
    public var questions: [QuizQuestion]
}

public struct QuizGapMastery: Decodable, Sendable, Hashable {
    public let gapId: String
    public let label: String
    public let justMastered: Bool
}

public struct QuizAnswerResult: Decodable, Sendable, Hashable {
    public let questionId: String
    public let outcome: String
    public let correctAnswerIndex: Int?
    public let correctAnswerIndexes: [Int]?
    public let correct: Int
    public let answered: Int
    public let total: Int
    public let status: String
    public let optionExplanations: [QuizOptionExplanation]?
    public let gapMastery: QuizGapMastery?
}

public struct PrepareQuizInput: Encodable, Sendable {
    public var scope = "topic"
    public let scopeId: String
    public var allowMultiSelect = true
    public var regenerate: Bool?
}

public struct AnswerQuizInput: Encodable, Sendable {
    public let questionId: String
    public var selectedIndex: Int?
    public var selectedIndices: [Int]?
}

public struct SocraticTurn: Decodable, Sendable, Hashable {
    public let id: String
    public let conceptLabel: String
    public let prompt: String
}

public struct SocraticSession: Decodable, Sendable, Hashable {
    public let id: String
    public let status: String
    public let current: SocraticTurn?
    public let conceptsTotal: Int
    public let conceptsCovered: Int
    public let topicMaturity: Double
}

public struct SocraticCheckpointSummary: Decodable, Sendable, Hashable {
    public let solidConcepts: [String]?
    public let exchangeCount: Int?
}

public struct SocraticAnswerResult: Decodable, Sendable, Hashable {
    public let action: String
    public let feedback: String
    public let next: SocraticTurn?
    public let status: String
    public let conceptsCovered: Int
    public let conceptsTotal: Int
    public let topicMaturity: Double
    public let checkpointReached: Bool?
    public let checkpointSummary: SocraticCheckpointSummary?
}

public struct SocraticGap: Decodable, Sendable, Hashable {
    public let label: String
}

public struct SocraticSummary: Decodable, Sendable, Hashable {
    public let topicTitle: String
    public let depth: String?
    public let solidConcepts: [String]
    public let mostRecentGap: SocraticGap?
    public let exchangeCount: Int?
}

public struct SocraticCompleteResult: Decodable, Sendable {
    public let completed: Bool
    public let summary: SocraticSummary?
}

public struct StartSocraticInput: Encodable, Sendable {
    public let topicId: String
    public var regenerate: Bool?
}

public struct AnswerSocraticInput: Encodable, Sendable {
    public let turnId: String
    public let answer: String
}

public enum QuizError: Sendable {
    public static func message(for error: Error, notFound: String = "This topic was removed.") -> String {
        if case APIError.badStatus(let status, let code) = error {
            switch (status, code) {
            case (409, "not_confirmed"?):
                return "This course isn't confirmed yet. Confirm it on the web first."
            case (409, "calibration_required"?):
                return "Take this course's calibration quiz on the web first."
            case (502, "generation_failed"?):
                return "Couldn't generate questions right now. Try again."
            default:
                break
            }
        }

        return StudyToolsError.message(for: error, notFound: notFound)
    }

    public static func isBlocked(_ error: Error) -> Bool {
        if case APIError.badStatus(409, let code) = error {
            return code == "not_confirmed" || code == "calibration_required"
        }

        return false
    }
}
