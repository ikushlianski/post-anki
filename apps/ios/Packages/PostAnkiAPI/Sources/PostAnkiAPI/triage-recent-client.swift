import Foundation

extension APIClient {
    static let triageRecentQueryLimit = 200

    static func triageRecentPath(q: String, mode: TriageHistorySearchMode, days: Int = 7) -> String {
        let trimmed = String(q.trimmingCharacters(in: .whitespacesAndNewlines).prefix(triageRecentQueryLimit))
        var items = [URLQueryItem(name: "days", value: String(days))]

        if !trimmed.isEmpty {
            items.append(URLQueryItem(name: "q", value: trimmed))
            items.append(URLQueryItem(name: "mode", value: mode.rawValue))
        }

        return encodedPath("/triage-decisions/recent", query: items)
    }

    public static func recentTriageDecisions(q: String = "", mode: TriageHistorySearchMode = .both) async throws -> TriageRecentDecisions {
        try await request(triageRecentPath(q: q, mode: mode))
    }

    @discardableResult
    public static func setTriageDecisionReason(decisionId: String, reasonCode: String?, note: String? = nil) async throws -> TriageDecisionRecord {
        try await request(
            "/triage-decisions/\(encodedSegment(decisionId))",
            method: "PATCH",
            body: PatchTriageDecisionReasonInput(reasonCode: reasonCode, note: note)
        )
    }
}
