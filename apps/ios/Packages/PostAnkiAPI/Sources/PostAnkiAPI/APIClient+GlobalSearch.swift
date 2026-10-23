import Foundation

extension APIClient {
    private static func searchPath(_ path: String, query: String, limit: Int? = nil) -> String {
        var items = [URLQueryItem(name: "q", value: query)]

        if let limit {
            items.append(URLQueryItem(name: "limit", value: String(limit)))
        }

        return encodedPath(path, query: items)
    }

    public static func globalSearch(query: String) async throws -> GlobalSearchResponse {
        try await request(searchPath("/search", query: query))
    }

    public static func searchTopicsAndModules(query: String, limit: Int = 20) async throws -> [GlobalSearchRankedResult] {
        try await request(searchPath("/search/topics-modules", query: query, limit: limit))
    }
}
