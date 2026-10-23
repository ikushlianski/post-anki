import Foundation

extension APIClient {
    public static func knowledgeOverview(
        subjectId: String?,
        q: String?,
        limit: Int = 50,
        offset: Int = 0
    ) async throws -> KnowledgeOverviewPage {
        var items = [URLQueryItem(name: "limit", value: String(limit)), URLQueryItem(name: "offset", value: String(offset))]

        if let subjectId { items.append(URLQueryItem(name: "subjectId", value: subjectId)) }

        if let q, !q.isEmpty { items.append(URLQueryItem(name: "q", value: q)) }

        return try await request("/knowledge-bits/overview\(encodedQuery(items))")
    }

    public static func editKnowledgeBit(id: String, body: String, background: String?) async throws {
        let _: EmptyResponse = try await request(
            "/knowledge-bits/\(encodedSegment(id))",
            method: "PATCH",
            body: EditKnowledgeBitInput(body: body, background: background)
        )
    }

    public static func editQuestionVariant(id: String, prompt: String, answer: String) async throws -> String {
        let result: EditVariantResult = try await request(
            "/knowledge-bits/question-variants/\(encodedSegment(id))",
            method: "PATCH",
            body: EditVariantInput(prompt: prompt, answer: answer)
        )

        return result.variantId
    }

    public static func setSchedule(id: String, suspended: Bool?, buried: Bool?) async throws -> ScheduleControlResult {
        try await request(
            "/knowledge-bits/\(encodedSegment(id))/schedule",
            method: "PATCH",
            body: ScheduleControlInput(suspended: suspended, buried: buried, tz: TimeZone.current.identifier)
        )
    }

    public static func suspendedKnowledgeBits(offset: Int = 0) async throws -> SuspendedKnowledgePage {
        let items = [URLQueryItem(name: "limit", value: "50"), URLQueryItem(name: "offset", value: String(offset))]

        return try await request("/knowledge-bits/suspended\(encodedQuery(items))")
    }

    public static func deleteKnowledgeBits(ids: [String]) async throws -> KnowledgeBulkDeleteResult {
        try await request("/knowledge-bits/deletions", method: "POST", body: KnowledgeBitIdsInput(knowledgeBitIds: ids))
    }

    public static func moveKnowledgeBits(ids: [String], subjectId: String) async throws -> KnowledgeBulkMoveResult {
        try await request(
            "/knowledge-bits/moves",
            method: "POST",
            body: MoveKnowledgeBitsInput(knowledgeBitIds: ids, subjectId: subjectId)
        )
    }

    public static func setRejectFeedback(id: String, reasonCode: String, note: String?) async throws {
        let _: EmptyResponse = try await request(
            "/knowledge-bit-feedback/\(encodedSegment(id))",
            method: "PATCH",
            body: RejectFeedbackInput(reasonCode: reasonCode, note: note)
        )
    }
}
