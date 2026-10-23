import Foundation

extension APIClient {
    public static func librarySources() async throws -> [SourceLibraryItem] {
        try await request("/sources")
    }

    public static func refetchLibrarySource(id: String) async throws -> SourceLibraryRefetchResult {
        try await request("/sources/\(encodedSegment(id))/refetch", method: "POST")
    }

    public static func deleteLibrarySource(id: String) async throws -> SourceLibraryDeleteResult {
        try await request("/sources/\(encodedSegment(id))", method: "DELETE")
    }

    public static func contentInbox() async throws -> [ContentInboxItem] {
        try await request("/content-inbox")
    }
}
