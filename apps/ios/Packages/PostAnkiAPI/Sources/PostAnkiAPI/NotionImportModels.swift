import Foundation

public struct NotionImportInput: Encodable, Sendable {
    public let dataSourceId: String
    public let startCursor: String?

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(dataSourceId, forKey: .dataSourceId)
        try container.encodeIfPresent(startCursor, forKey: .startCursor)
    }

    private enum CodingKeys: String, CodingKey {
        case dataSourceId
        case startCursor
    }
}

public struct NotionImportResult: Decodable, Sendable {
    public let created: Int
    public let truncated: Bool
    public let nextCursor: String?
}
