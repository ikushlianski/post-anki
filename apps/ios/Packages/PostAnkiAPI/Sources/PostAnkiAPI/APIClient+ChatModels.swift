import Foundation

extension APIClient {
    public static func chatModels() async throws -> [ChatModelOption] {
        try await request("/chat/models")
    }
}
