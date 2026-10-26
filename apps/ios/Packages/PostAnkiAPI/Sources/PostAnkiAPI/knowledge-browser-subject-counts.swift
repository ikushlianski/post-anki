import Foundation

public struct KnowledgeBrowserSubjectCount: Decodable, Sendable, Hashable {
    public let subjectId: String?
    public let count: Int
    public let newCount: Int
    public let learningCount: Int
    public let matureCount: Int

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
        try await request("/knowledge-bits/browser/subjects")
    }
}
