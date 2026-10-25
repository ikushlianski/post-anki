import Foundation

extension APIClient {
    public static func exportKnowledgeBits(format: String = "csv") async throws -> Data {
        let req = try makeRequest("/knowledge-bits/export\(encodedQuery([URLQueryItem(name: "format", value: format)]))")
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if status == 401 { throw APIError.unauthorized }

        guard (200..<300).contains(status) else { throw APIError.badStatus(status, nil) }

        return data
    }
}
