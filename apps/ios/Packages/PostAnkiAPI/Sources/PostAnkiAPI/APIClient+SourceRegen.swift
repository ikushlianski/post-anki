import Foundation

extension APIClient {
    public static func regenerateKnowledgeSource(id: String) async throws -> SourceRegenStartResult {
        try await request(
            "/knowledge-sources/\(encodedSegment(id))/regeneration",
            method: "POST",
            body: SourceRegenInput()
        )
    }

    public static func knowledgeSourceRegeneration(id: String) async throws -> SourceRegenStatus {
        try await request("/knowledge-sources/\(encodedSegment(id))/regeneration")
    }

    public static func generateMoreVariants(bitId: String) async throws -> MoreVariantsResult {
        try await request("/knowledge-bits/\(encodedSegment(bitId))/variants", method: "POST")
    }
}
