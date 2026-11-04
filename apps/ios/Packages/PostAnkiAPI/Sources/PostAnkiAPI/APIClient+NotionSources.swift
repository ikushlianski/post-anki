import Foundation

extension APIClient {
    public static let notionRunTimeout: TimeInterval = 300

    public static func notionSources() async throws -> [NotionIngestionSource] {
        let response: NotionSourcesResponse = try await request("/notion-sources")

        return response.sources
    }

    public static func createNotionSource(_ input: NotionSourceInput) async throws -> NotionIngestionSource {
        try await request("/notion-sources", method: "POST", body: input)
    }

    public static func updateNotionSource(id: String, _ update: NotionSourceUpdate) async throws -> NotionIngestionSource {
        try await request("/notion-sources/\(encodedSegment(id))", method: "PATCH", body: update)
    }

    public static func deleteNotionSource(id: String) async throws {
        let _: EmptyResponse = try await request("/notion-sources/\(encodedSegment(id))", method: "DELETE")
    }

    public static func runNotionSource(id: String) async throws -> NotionRunResult {
        try await request("/notion-sources/\(encodedSegment(id))/runs", method: "POST", timeout: notionRunTimeout)
    }

    public static func notionConnection() async throws -> NotionConnectionStatus {
        try await request("/notion-connection")
    }

    public static func saveNotionToken(_ token: String) async throws -> NotionConnectionStatus {
        try await request("/notion-connection", method: "PUT", body: NotionTokenBody(token: token))
    }

    public static func removeNotionToken() async throws -> NotionConnectionStatus {
        try await request("/notion-connection", method: "DELETE")
    }

    public static func checkNotionConnection() async throws -> NotionConnectionCheck {
        try await request("/notion-connection/checks", method: "POST")
    }
}

private struct NotionTokenBody: Encodable {
    let token: String
}
