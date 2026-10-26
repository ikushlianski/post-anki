import Foundation

extension APIClient {
    public static func regenerateKnowledgeSource(id: String, text: String? = nil) async throws -> SourceRegenStartResult {
        try await request(
            "/knowledge-sources/\(encodedSegment(id))/regeneration",
            method: "POST",
            body: SourceRegenInput(text: text)
        )
    }

    public static func discardKnowledgeSource(id: String) async throws {
        let _: EmptyResponse = try await request("/knowledge-sources/\(encodedSegment(id))/discards", method: "POST")
    }

    public static func knowledgeSourceRegeneration(id: String) async throws -> SourceRegenStatus {
        try await request("/knowledge-sources/\(encodedSegment(id))/regeneration")
    }

    public static func generateMoreVariants(bitId: String) async throws -> MoreVariantsResult {
        try await request("/knowledge-bits/\(encodedSegment(bitId))/variants", method: "POST")
    }
}
