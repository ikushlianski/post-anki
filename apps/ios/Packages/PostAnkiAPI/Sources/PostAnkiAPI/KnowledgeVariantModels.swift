import Foundation

public struct KnowledgeBitVariant: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let kind: String
    public let prompt: String
    public let answer: String
}

struct KnowledgeBitVariantList: Decodable, Sendable {
    let variants: [KnowledgeBitVariant]
}

extension APIClient {
    public static func knowledgeBitVariants(bitId: String) async throws -> [KnowledgeBitVariant] {
        let list: KnowledgeBitVariantList = try await request("/knowledge-bits/\(encodedSegment(bitId))/variants")

        return list.variants
    }
}
