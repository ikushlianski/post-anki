import Foundation

public struct PendingReviewPage: Decodable, Sendable {
    public let sources: [PendingReviewSource]
    public let total: Int?

    public init(sources: [PendingReviewSource], total: Int?) {
        self.sources = sources
        self.total = total
    }

    private enum CodingKeys: String, CodingKey {
        case items, total
    }

    public init(from decoder: Decoder) throws {
        if let keyed = try? decoder.container(keyedBy: CodingKeys.self), keyed.contains(.items) {
            sources = try keyed.decode([PendingReviewSource].self, forKey: .items)
            total = try? keyed.decodeIfPresent(Int.self, forKey: .total)
        } else {
            sources = try decoder.singleValueContainer().decode([PendingReviewSource].self)
            total = nil
        }
    }
}

public struct PendingReviewCursor: Sendable, Equatable {
    public let createdAt: String
    public let id: String

    public init(createdAt: String, id: String) {
        self.createdAt = createdAt
        self.id = id
    }

    public func isBefore(_ other: PendingReviewCursor) -> Bool {
        createdAt != other.createdAt ? createdAt < other.createdAt : id < other.id
    }
}

extension APIClient {
    public static func listPendingReviewPage(
        limit: Int?,
        subjectId: String?,
        attention: Bool,
        after: PendingReviewCursor? = nil
    ) async throws -> PendingReviewPage {
        var query = attention ? [URLQueryItem(name: "attention", value: "1")] : []

        if let limit { query.append(URLQueryItem(name: "limit", value: String(limit))) }

        if let subjectId { query.append(URLQueryItem(name: "subjectId", value: subjectId)) }

        if let after {
            query.append(URLQueryItem(name: "afterCreatedAt", value: after.createdAt))
            query.append(URLQueryItem(name: "afterId", value: after.id))
        }

        query.append(URLQueryItem(name: "includeTotal", value: "1"))

        return try await request(encodedPath("/knowledge-bits/pending-review", query: query))
    }
}
