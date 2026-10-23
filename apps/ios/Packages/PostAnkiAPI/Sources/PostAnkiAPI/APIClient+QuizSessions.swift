import Foundation

extension APIClient {
    public static func activeTopicQuiz(topicId: String) async throws -> QuizSession? {
        try await request(encodedPath("/probe-sessions/active", query: [
            URLQueryItem(name: "scope", value: "topic"),
            URLQueryItem(name: "scopeId", value: topicId),
            URLQueryItem(name: "mode", value: "practice")
        ]))
    }

    public static func prepareTopicQuiz(topicId: String, regenerate: Bool) async throws -> QuizSession {
        try await request(
            "/probe-sessions",
            method: "POST",
            body: PrepareQuizInput(scopeId: topicId, regenerate: regenerate ? true : nil)
        )
    }

    public static func answerQuizQuestion(
        sessionId: String,
        questionId: String,
        selected: [Int],
        multi: Bool
    ) async throws -> QuizAnswerResult {
        let body = multi
            ? AnswerQuizInput(questionId: questionId, selectedIndices: selected.sorted())
            : AnswerQuizInput(questionId: questionId, selectedIndex: selected.first)

        return try await request(
            "/probe-sessions/\(encodedSegment(sessionId))/answer",
            method: "POST",
            body: body
        )
    }

    public static func startSocratic(topicId: String, regenerate: Bool) async throws -> SocraticSession {
        try await request(
            "/socratic-sessions",
            method: "POST",
            body: StartSocraticInput(topicId: topicId, regenerate: regenerate ? true : nil)
        )
    }

    public static func answerSocratic(sessionId: String, turnId: String, answer: String) async throws -> SocraticAnswerResult {
        try await request(
            "/socratic-sessions/\(encodedSegment(sessionId))/answer",
            method: "POST",
            body: AnswerSocraticInput(turnId: turnId, answer: answer)
        )
    }

    public static func completeSocratic(sessionId: String) async throws -> SocraticCompleteResult {
        try await request("/socratic-sessions/\(encodedSegment(sessionId))/complete", method: "POST")
    }
}
