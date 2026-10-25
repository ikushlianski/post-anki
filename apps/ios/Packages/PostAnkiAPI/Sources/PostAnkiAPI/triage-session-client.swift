import Foundation

extension APIClient {
    public static func startTriageSession(
        subjectId: String?,
        startKey: String? = nil
    ) async throws -> TriageSessionResponse {
        try await request(
            "/triage-sessions",
            method: "POST",
            body: StartTriageSessionInput(subjectId: subjectId, client: "ios", startKey: startKey)
        )
    }

    @discardableResult
    public static func discardTriageSession(id: String, undecidedCount: Int? = nil) async throws -> TriageSessionResponse {
        try await request(
            "/triage-sessions/\(encodedSegment(id))/discards",
            method: "POST",
            body: DiscardTriageSessionInput(undecidedCount: undecidedCount)
        )
    }

    public static func finishTriageSession(
        id: String,
        feedbackText: String,
        decisions: [TriageDecision],
        undecidedCount: Int? = nil
    ) async throws -> TriageSessionResponse {
        try await request(
            "/triage-sessions/\(encodedSegment(id))/finish",
            method: "POST",
            body: FinishTriageSessionInput(feedbackText: feedbackText, decisions: decisions, undecidedCount: undecidedCount)
        )
    }

    @discardableResult
    public static func putTriageDecision(
        sessionId: String,
        bitId: String,
        verdict: TriageVerdict,
        note: String? = nil,
        reason: TriageReasonUpdate = .unchanged,
        dwellMs: Int? = nil
    ) async throws -> TriageDecisionRecord {
        try await request(
            "/triage-sessions/\(encodedSegment(sessionId))/decisions/\(encodedSegment(bitId))",
            method: "PUT",
            body: PutTriageDecisionInput(verdict: verdict, note: note, reason: reason, dwellMs: dwellMs)
        )
    }

    public static func undoTriageDecision(sessionId: String, bitId: String) async throws {
        let _: EmptyResponse = try await request(
            "/triage-sessions/\(encodedSegment(sessionId))/decisions/\(encodedSegment(bitId))",
            method: "DELETE"
        )
    }

    public static func listTriageDecisions(sessionId: String) async throws -> [TriageDecisionRecord] {
        let list: TriageDecisionList = try await request("/triage-sessions/\(encodedSegment(sessionId))/decisions")

        return list.decisions
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
