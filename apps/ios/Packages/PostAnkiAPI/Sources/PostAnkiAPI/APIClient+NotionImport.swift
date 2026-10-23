import Foundation

extension APIClient {
    public static func importNotionSource(dataSourceId: String, startCursor: String?) async throws -> NotionImportResult {
        try await request(
            "/knowledge-sources/notion",
            method: "POST",
            body: NotionImportInput(dataSourceId: dataSourceId, startCursor: startCursor)
        )
    }
}
