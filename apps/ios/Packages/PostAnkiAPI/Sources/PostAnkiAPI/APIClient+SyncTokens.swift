import Foundation

public struct SyncToken: Decodable, Sendable, Equatable {
    public let token: String
    public let expiresAt: String
    public let expiresInSeconds: Int

    public init(token: String, expiresAt: String, expiresInSeconds: Int) {
        self.token = token
        self.expiresAt = expiresAt
        self.expiresInSeconds = expiresInSeconds
    }
}

extension APIClient {
    public static func createSyncToken() async throws -> SyncToken {
        try await request("/sync-tokens", method: "POST")
    }
}
