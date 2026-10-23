import Foundation

extension APIClient {
    private static func practicePath(_ subjectId: String, _ suffix: String) throws -> String {
        return "/subjects/\(encodedSegment(subjectId))/\(suffix)"
    }

    public static func listPracticeSubjects() async throws -> [PracticeSubject] {
        try await request("/subjects")
    }

    public static func practiceSettings(subjectId: String) async throws -> PracticeSettings {
        try await request(try practicePath(subjectId, "practice-settings"))
    }

    public static func updatePracticeSettings(subjectId: String, level: String?, pack: String?) async throws -> PracticeSettings {
        try await request(
            try practicePath(subjectId, "practice-settings"),
            method: "PATCH",
            body: PracticeSettingsInput(level: level, pack: pack)
        )
    }

    public static func createPhraseBatch(subjectId: String) async throws -> [Phrase] {
        let batch: PhraseBatch = try await request(try practicePath(subjectId, "phrase-batches"), method: "POST")

        return batch.phrases
    }

    public static func submitPhraseAttempts(subjectId: String, answers: [PhraseAnswerInput]) async throws -> PhraseAttemptsResult {
        try await request(
            try practicePath(subjectId, "attempts"),
            method: "POST",
            body: PhraseAttemptsInput(answers: answers)
        )
    }

    public static func phraseBank(subjectId: String) async throws -> PhraseBank {
        try await request(try practicePath(subjectId, "phrase-bank"))
    }

    public static func createWritingCheck(subjectId: String, text: String) async throws -> WritingCheck {
        try await request(
            try practicePath(subjectId, "writing-checks"),
            method: "POST",
            body: WritingCheckInput(text: text)
        )
    }

    public static func listWritingChecks(subjectId: String) async throws -> [WritingCheck] {
        try await request(try practicePath(subjectId, "writing-checks"))
    }
}
