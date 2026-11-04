import Foundation

public struct KnowledgeBrowserSubjectCount: Decodable, Sendable, Hashable {
    public let subjectId: String?
    public let count: Int
    public let newCount: Int
    public let learningCount: Int
    public let matureCount: Int

    private enum CodingKeys: String, CodingKey { case subjectId, count, newCount, learningCount, matureCount }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        subjectId = container.lenientOptionalString(.subjectId)
        count = max(0, container.lenientInt(.count))
        newCount = max(0, container.lenientInt(.newCount))
        matureCount = max(0, container.lenientInt(.matureCount))
        learningCount = max(0, container.lenientInt(.learningCount, default: count - newCount - matureCount))
    }

    public init(subjectId: String?, count: Int, newCount: Int, learningCount: Int, matureCount: Int) {
        self.subjectId = subjectId
        self.count = count
        self.newCount = newCount
        self.learningCount = learningCount
        self.matureCount = matureCount
    }
}

extension APIClient {
    public static func knowledgeBrowserSubjectCounts() async throws -> [KnowledgeBrowserSubjectCount] {
        let rows: LossyArray<KnowledgeBrowserSubjectCount> = try await request("/knowledge-bits/browser/subjects")

        return rows.elements
    }
}
