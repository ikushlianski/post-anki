import Foundation

extension APIClient {
    public static let meaningSearchQueryLimit = 300

    public static func knowledgeMeaningMatches(
        q: String,
        subjectId: String?,
        states: [String] = [],
        origins: [String] = []
    ) async throws -> KnowledgeMeaningMatches {
        try await request(knowledgeMeaningMatchesPath(q: q, subjectId: subjectId, states: states, origins: origins))
    }

    static func knowledgeMeaningMatchesPath(q: String, subjectId: String?, states: [String], origins: [String]) -> String {
        var items = [URLQueryItem(name: "q", value: String(q.prefix(meaningSearchQueryLimit)))]

        if let subjectId { items.append(URLQueryItem(name: "subjectId", value: subjectId)) }

        items += filterQueryItems(states: states, origins: origins)

        return "/knowledge-bits/browser/matches\(encodedQuery(items))"
    }
}
