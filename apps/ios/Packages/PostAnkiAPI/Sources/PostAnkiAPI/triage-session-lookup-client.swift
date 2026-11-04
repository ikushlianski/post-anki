import Foundation

extension APIClient {
    public static func getTriageSession(id: String) async throws -> TriageSessionResponse {
        try await request("/triage-sessions/\(encodedSegment(id))")
    }
}
