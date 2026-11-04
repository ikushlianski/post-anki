import Foundation

extension APIClient {
    static func rejectedCardsPath(reason: RejectedCardReason?, subjectId: String? = nil, query: String? = nil, offset: Int, limit: Int) -> String {
        var items: [URLQueryItem] = []

        if let reason { items.append(URLQueryItem(name: "reason", value: reason.rawValue)) }

        if let subjectId, !subjectId.isEmpty { items.append(URLQueryItem(name: "subjectId", value: subjectId)) }

        if let term = RejectedSearchQuery.normalize(query) { items.append(URLQueryItem(name: "q", value: term)) }

        items.append(URLQueryItem(name: "limit", value: String(limit)))
        items.append(URLQueryItem(name: "offset", value: String(offset)))

        return "/knowledge-bits/rejected" + encodedQuery(items)
    }

    public static func rejectedCards(
        reason: RejectedCardReason? = nil,
        subjectId: String? = nil,
        query: String? = nil,
        offset: Int = 0,
        limit: Int = 50
    ) async throws -> RejectedCardsPage {
        try await request(rejectedCardsPath(reason: reason, subjectId: subjectId, query: query, offset: offset, limit: limit))
    }
}

public enum RejectedCardRestoreOutcome: Sendable, Equatable {
    case restored
    case alreadyGone
    case notRejected
    case failed

    public static func outcome(for error: Error) -> RejectedCardRestoreOutcome {
        if case APIError.badStatus(404, _) = error { return .alreadyGone }
        if case APIError.badStatus(409, _) = error { return .notRejected }

        return .failed
    }
}

private struct RestoreRejectedAck: Decodable, Sendable {}

extension APIClient {
    static func restoreRejectedPath(id: String) -> String {
        "/knowledge-bits/\(encodedSegment(id))/restore-rejected"
    }

    public static func restoreRejectedCard(id: String) async throws {
        let _: RestoreRejectedAck = try await request(restoreRejectedPath(id: id), method: "POST")
    }
}
