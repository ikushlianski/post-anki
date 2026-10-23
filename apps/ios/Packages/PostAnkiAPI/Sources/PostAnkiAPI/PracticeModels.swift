import Foundation

public struct PracticeSubject: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let kind: String?
}

public struct PracticeSettings: Decodable, Sendable, Hashable {
    public let level: String
    public let pack: String
}

public struct PracticeSettingsInput: Encodable, Sendable {
    public let level: String?
    public let pack: String?

    public init(
        level: String?,
        pack: String?
    ) {
        self.level = level
        self.pack = pack
    }
}

public struct Phrase: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let russian: String
    public let referenceEnglish: String
}

public struct PhraseBatch: Decodable, Sendable {
    public let phrases: [Phrase]
}

public struct PhraseAnswerInput: Encodable, Sendable {
    public let phraseId: String
    public let userAnswer: String

    public init(
        phraseId: String,
        userAnswer: String
    ) {
        self.phraseId = phraseId
        self.userAnswer = userAnswer
    }
}

public struct PhraseAttemptsInput: Encodable, Sendable {
    public let answers: [PhraseAnswerInput]
}

public struct PhraseAttempt: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let phraseId: String
    public let userAnswer: String
    public let score: Int
    public let verdict: String
    public let feedback: String
    public let nativeAlternatives: [String]

    public var verdictLabel: String {
        switch verdict {
        case "Ok": "Ok"
        case "NeedsReview": "Needs review"
        case "NeedsDeepDive": "Needs deep dive"
        default: verdict
        }
    }
}

public struct PhraseBankUpdate: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let phraseText: String
    public let status: String
}

public struct PhraseAttemptsResult: Decodable, Sendable {
    public let attempts: [PhraseAttempt]
    public let phraseBankUpdates: [PhraseBankUpdate]
}

public struct PhraseBankEntry: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let phraseText: String
    public let category: String?
    public let status: String

    public var statusLabel: String {
        switch status {
        case "new": "New"
        case "practicing": "Practicing"
        case "struggling": "Struggling"
        case "mastered": "Mastered"
        default: status
        }
    }
}

public struct PhraseBank: Decodable, Sendable {
    public let active: [PhraseBankEntry]
    public let mastered: [PhraseBankEntry]
}

public struct WritingCheckInput: Encodable, Sendable {
    public let text: String
}

public struct WritingCheck: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let text: String
    public let score: Int
    public let verdict: String
    public let feedback: String
    public let nativeAlternatives: [String]
    public let createdAt: String
}

public enum PracticeOptions: Sendable {
    public static let levels: [(value: String, label: String)] = [
        ("A1_A2", "A1-A2 Beginner"),
        ("B1_B2", "B1-B2 Intermediate"),
        ("C1_C2", "C1-C2 Advanced")
    ]

    public static let packs: [(value: String, label: String)] = [
        ("General", "General"),
        ("StandupUpdates", "Standup updates"),
        ("CodeReview", "Code review"),
        ("IncidentPostmortems", "Incident postmortems"),
        ("GivingFeedback", "Giving feedback")
    ]
}

public enum PracticeError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(let status, let code) = error {
            if code == "not_a_language_practice_subject" {
                return "This subject isn't set up for language practice."
            }

            if status >= 500 { return "Couldn't make phrases right now. Try again." }
        }

        return StudyToolsError.message(for: error, notFound: "That subject is gone.")
    }
}
