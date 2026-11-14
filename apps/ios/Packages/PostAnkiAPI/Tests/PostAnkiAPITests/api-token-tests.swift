import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Personal API keys")
    struct ApiTokenContractTests {
        @Test("should decode the key list including revoked and never-used keys")
        func listsKeys() async throws {
            let json = #"{"tokens":[{"id":"t2","name":"Claude","scopes":["knowledge:write","cards:write"],"createdAt":"2026-11-01T10:00:00Z","lastUsedAt":null,"revokedAt":null},{"id":"t1","name":"Old","scopes":["knowledge:write"],"createdAt":"2026-10-01T10:00:00Z","lastUsedAt":"2026-10-02T10:00:00Z","revokedAt":"2026-10-03T10:00:00Z"}]}"#
            RecordingStub.install(body: Data(json.utf8))

            let keys = try await APIClient.listApiTokens()

            #expect(RecordingStub.last?.method == "GET")
            #expect(RecordingStub.last?.path == "/api-tokens")
            #expect(keys.map(\.id) == ["t2", "t1"])
            #expect(keys[0].lastUsedAt == nil && !keys[0].isRevoked)
            #expect(keys[1].isRevoked)
            #expect(keys[0].scopeLabels == ["Add knowledge (notes and sources)", "Create and edit cards"])
        }

        @Test("should send the name and chosen scopes and return the raw key once")
        func createsKey() async throws {
            let json = #"{"id":"t3","name":"Laptop","scopes":["cards:write"],"createdAt":"x","lastUsedAt":null,"revokedAt":null,"token":"pat_secret"}"#
            RecordingStub.install(status: 201, body: Data(json.utf8))

            let created = try await APIClient.createApiToken(name: "Laptop", scopes: [.cardsWrite])

            #expect(RecordingStub.last?.method == "POST")
            #expect(RecordingStub.last?.path == "/api-tokens")
            #expect(RecordingStub.last?.body?["name"] as? String == "Laptop")
            #expect(RecordingStub.last?.body?["scopes"] as? [String] == ["cards:write"])
            #expect(created.token == "pat_secret")
        }

        @Test("should revoke by id with a DELETE")
        func revokesKey() async throws {
            RecordingStub.install(body: Data(#"{"id":"t1","revoked":true}"#.utf8))

            try await APIClient.revokeApiToken(id: "t1")

            #expect(RecordingStub.last?.method == "DELETE")
            #expect(RecordingStub.last?.path == "/api-tokens/t1")
        }
    }
}
