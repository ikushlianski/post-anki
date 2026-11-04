import Foundation

public struct PendingReviewSubjectCount: Decodable, Sendable, Hashable, Identifiable {
    public let subjectId: String
    public let name: String
    public let path: String
    public let pendingCount: Int

    public var id: String { subjectId }

    private enum CodingKeys: String, CodingKey { case subjectId, name, path, pendingCount }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        subjectId = try container.decode(String.self, forKey: .subjectId)
        name = (try? container.decodeIfPresent(String.self, forKey: .name)) ?? "Untitled subject"
        path = (try? container.decodeIfPresent(String.self, forKey: .path)) ?? name
        pendingCount = container.lenientInt(.pendingCount)
    }

    public init(subjectId: String, name: String, path: String, pendingCount: Int) {
        self.subjectId = subjectId
        self.name = name
        self.path = path
        self.pendingCount = pendingCount
    }
}

extension APIClient {
    public static func pendingReviewSubjects() async throws -> [PendingReviewSubjectCount] {
        let rows: LossyArray<PendingReviewSubjectCount> = try await request("/knowledge-bits/pending-review/subjects")

        return rows.elements.filter { $0.pendingCount > 0 }
    }
}
