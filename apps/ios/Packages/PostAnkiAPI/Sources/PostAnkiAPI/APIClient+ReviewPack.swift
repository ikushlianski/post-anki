import Foundation

extension APIClient {
    public static func reviewPack(tz: String) async throws -> ReviewPack {
        try await request(encodedPath("/knowledge-bits/review-packs/current", query: [URLQueryItem(name: "tz", value: tz)]))
    }
}
