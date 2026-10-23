import Foundation

extension APIClient {
    public static func topicGaps(topicId: String) async throws -> [Gap] {
        try await request("/topics/\(encodedSegment(topicId))/gaps")
    }

    public static func declareGap(_ input: DeclareGapInput) async throws -> Gap {
        try await request("/gaps", method: "POST", body: input)
    }

    public static func curateGap(id: String, _ input: CurateGapInput) async throws -> Gap {
        try await request("/gaps/\(encodedSegment(id))", method: "PATCH", body: input)
    }

    public static func triageGap(id: String, action: String) async throws -> TriageGapResult {
        try await request(
            "/gaps/\(encodedSegment(id))/triage",
            method: "POST",
            body: TriageGapInput(action: action)
        )
    }

    public static func gapsDueForResurface() async throws -> GapsDueForResurface {
        try await request("/gaps/due-for-resurface")
    }
}
