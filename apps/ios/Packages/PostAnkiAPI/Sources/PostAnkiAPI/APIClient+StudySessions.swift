import Foundation

extension APIClient {
    public static func studySessions() async throws -> [StudySessionListItem] {
        try await request("/study-sessions")
    }

    public static func createStudySession(_ input: CreateStudySessionInput) async throws -> StudySession {
        try await request("/study-sessions", method: "POST", body: input)
    }

    public static func studySessionConsistency() async throws -> StudySessionConsistency {
        try await request("/study-sessions/consistency")
    }

    public static func studySession(id: String) async throws -> StudySession {
        try await request("/study-sessions/\(encodedSegment(id))")
    }

    public static func startStudySession(id: String) async throws -> StudySession {
        try await request("/study-sessions/\(encodedSegment(id))/start", method: "PATCH")
    }

    public static func studySessionPush(id: String, excludeGapIds: [String]) async throws -> StudySessionPush {
        var items = [URLQueryItem(name: "mode", value: "socratic")]

        if !excludeGapIds.isEmpty {
            items.append(URLQueryItem(name: "excludeGapIds", value: excludeGapIds.joined(separator: ",")))
        }

        let target = encodedPath("/study-sessions/\(encodedSegment(id))/push", query: items)

        return try await request(target)
    }

    public static func answerTopicProbe(
        topicId: String,
        gapId: String?,
        answer: String,
        selfOutcome: String?
    ) async throws -> TopicProbeResult {
        try await request(
            "/topics/\(encodedSegment(topicId))/probe/answer",
            method: "POST",
            body: TopicProbeAnswerInput(gapId: gapId, answer: answer, selfOutcome: selfOutcome)
        )
    }

    public static func recordStudySessionAnswer(id: String, correct: Bool) async throws -> StudySession {
        try await request(
            "/study-sessions/\(encodedSegment(id))/answers",
            method: "PATCH",
            body: RecordSessionAnswerInput(correct: correct)
        )
    }

    public static func endStudySession(id: String, userRequestedEnd: Bool) async throws -> StudySession {
        try await request(
            "/study-sessions/\(encodedSegment(id))/end",
            method: "PATCH",
            body: EndStudySessionInput(userRequestedEnd: userRequestedEnd)
        )
    }
}
