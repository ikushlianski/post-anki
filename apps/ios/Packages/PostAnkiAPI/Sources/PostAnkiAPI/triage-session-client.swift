import Foundation

extension APIClient {
    public static func startTriageSession(subjectId: String?) async throws -> TriageSessionResponse {
        try await request("/triage-sessions", method: "POST", body: StartTriageSessionInput(subjectId: subjectId))
    }

    public static func finishTriageSession(
        id: String,
        feedbackText: String,
        decisions: [TriageDecision]
    ) async throws -> TriageSessionResponse {
        try await request(
            "/triage-sessions/\(encodedSegment(id))/finish",
            method: "POST",
            body: FinishTriageSessionInput(feedbackText: feedbackText, decisions: decisions)
        )
    }

    @discardableResult
    public static func gradeKnowledgeBit(id: String, rating: Int, note: String?) async throws -> String? {
        let result: GradeKnowledgeBitResult = try await request(
            "/knowledge-bits/\(encodedSegment(id))/grades",
            method: "POST",
            body: GradeKnowledgeBitInput(rating: rating, note: note)
        )

        return result.feedbackId
    }

    public static func updateKnowledgeBitFeedbackNote(id: String, note: String) async throws {
        let _: EmptyResponse = try await request(
            "/knowledge-bit-feedback/\(encodedSegment(id))",
            method: "PATCH",
            body: KnowledgeBitFeedbackNoteInput(note: note)
        )
    }
}
