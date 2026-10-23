import Foundation

extension APIClient {
    public static func createDecideSession(decision: String, opinion: String) async throws -> DecideSession {
        try await request(
            "/decide-sessions",
            method: "POST",
            body: CreateDecideSessionInput(decision: decision, opinion: opinion)
        )
    }

    public static func listDecideSessions() async throws -> [DecideSession] {
        try await request("/decide-sessions")
    }

    public static func resolveBlindSpot(id: String, accepted: Bool) async throws -> DecideBlindSpot {
        return try await request(
            "/decide-blind-spots/\(encodedSegment(id))",
            method: "PATCH",
            body: ResolveBlindSpotInput(status: accepted ? "accepted" : "rejected")
        )
    }
}
