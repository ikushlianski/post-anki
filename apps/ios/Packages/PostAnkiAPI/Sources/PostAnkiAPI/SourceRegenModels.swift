import Foundation

public struct SourceRegenInput: Encodable, Sendable {}

public struct SourceRegenStartResult: Decodable, Sendable {
    public let status: String
    public let supersededCount: Int
}

public struct SourceRegenStatus: Decodable, Sendable {
    public let status: String
    public let failureReason: String?
}

public struct MoreVariantsResult: Decodable, Sendable {
    public let ok: Bool
}
