import Foundation

extension APIClient {
    public static func askAllCards(
        message: String,
        transcript: [ChatTranscriptEntry],
        allowGeneralKnowledge: Bool
    ) async throws -> AskAllCardsResult {
        try await request(
            "/global-card-chat",
            method: "POST",
            body: AskAllCardsInput(
                message: message,
                transcript: transcript.isEmpty ? nil : transcript,
                allowGeneralKnowledge: allowGeneralKnowledge
            )
        )
    }

    public static func askTopicChat(
        topicId: String,
        message: String,
        transcript: [ChatTranscriptEntry]
    ) async throws -> TopicChatResult {
        try await request(
            "/topics/\(encodedSegment(topicId))/study-chat",
            method: "POST",
            body: TopicChatInput(message: message, transcript: transcript.isEmpty ? nil : transcript)
        )
    }

    public static func createTopicNote(topicId: String, body: String, isHighlight: Bool) async throws -> Note {
        try await request(
            "/notes",
            method: "POST",
            body: CreateNoteInput(nodeType: "topic", nodeId: topicId, body: body, isHighlight: isHighlight)
        )
    }

    public static func topicNotes(topicId: String) async throws -> [Note] {
        let target = encodedPath("/notes", query: [
            URLQueryItem(name: "nodeType", value: "topic"),
            URLQueryItem(name: "nodeId", value: topicId)
        ])

        return try await request(target)
    }

    public static func searchNotes(query: String) async throws -> [Note] {
        try await request(encodedPath("/notes/search", query: [URLQueryItem(name: "q", value: query)]))
    }

    public static func openQuestions(status: String) async throws -> OpenQuestionsPage {
        try await request(encodedPath("/open-questions", query: [URLQueryItem(name: "status", value: status)]))
    }

    public static func resolveOpenQuestion(
        id: String,
        status: OpenQuestionResolution,
        answerText: String?
    ) async throws -> OpenQuestion {
        try await request(
            "/open-questions/\(encodedSegment(id))",
            method: "PATCH",
            body: ResolveOpenQuestionInput(status: status.rawValue, answerText: answerText)
        )
    }
}
