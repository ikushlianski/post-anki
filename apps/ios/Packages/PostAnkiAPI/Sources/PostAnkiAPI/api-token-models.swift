import Foundation

public enum ApiTokenScope: String, Codable, Sendable, CaseIterable, Identifiable {
    case knowledgeWrite = "knowledge:write"
    case cardsWrite = "cards:write"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .knowledgeWrite: "Add knowledge (notes and sources)"
        case .cardsWrite: "Create and edit cards"
        }
    }

    public static let nameMaxLength = 80
}

public struct ApiTokenSummary: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let scopes: [String]
    public let createdAt: String
    public let lastUsedAt: String?
    public let revokedAt: String?

    public init(
        id: String,
        name: String,
        scopes: [String],
        createdAt: String,
        lastUsedAt: String? = nil,
        revokedAt: String? = nil
    ) {
        self.id = id
        self.name = name
        self.scopes = scopes
        self.createdAt = createdAt
        self.lastUsedAt = lastUsedAt
        self.revokedAt = revokedAt
    }

    public var isRevoked: Bool { revokedAt != nil }

    public var scopeLabels: [String] {
        scopes.map { raw in ApiTokenScope(rawValue: raw)?.label ?? raw }
    }
}

public struct CreatedApiToken: Decodable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let scopes: [String]
    public let token: String

    public init(id: String, name: String, scopes: [String], token: String) {
        self.id = id
        self.name = name
        self.scopes = scopes
        self.token = token
    }
}

struct ApiTokenList: Decodable {
    let tokens: [ApiTokenSummary]
}

struct CreateApiTokenInput: Encodable {
    let name: String
    let scopes: [String]
}

struct RevokeApiTokenResult: Decodable {
    let id: String
    let revoked: Bool
}

extension APIClient {
    public static func listApiTokens() async throws -> [ApiTokenSummary] {
        let list: ApiTokenList = try await request("/api-tokens")

        return list.tokens
    }

    public static func createApiToken(name: String, scopes: [ApiTokenScope]) async throws -> CreatedApiToken {
        try await request(
            "/api-tokens",
            method: "POST",
            body: CreateApiTokenInput(name: name, scopes: scopes.map(\.rawValue))
        )
    }

    public static func revokeApiToken(id: String) async throws {
        let _: RevokeApiTokenResult = try await request("/api-tokens/\(encodedSegment(id))", method: "DELETE")
    }
}
