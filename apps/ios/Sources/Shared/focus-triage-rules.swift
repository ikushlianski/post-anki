import PostAnkiAPI

enum FocusTriageNote {
    static let maxCharacters = 500

    static func trimmed(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        return text.isEmpty ? nil : String(text.prefix(maxCharacters))
    }
}

enum FocusTriageFeedback {
    static let maxCharacters = 8_000

    static func trimmed(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        return text.isEmpty ? nil : String(text.prefix(maxCharacters))
    }
}

enum FocusTriageSubject {
    static func single(_ sources: [PendingReviewSource]) -> String? {
        let withBits = sources.filter { !$0.bits.isEmpty }
        let first = withBits.first?.subjectId

        guard let first, withBits.allSatisfy({ $0.subjectId == first }) else { return nil }

        return first
    }
}

enum FocusTriagePollPlan {
    static let interval: Duration = .seconds(8)
    static let maxAttempts = 40

    static func shouldPoll(waiting: Int, attempts: Int) -> Bool {
        waiting > 0 && attempts < maxAttempts
    }
}
