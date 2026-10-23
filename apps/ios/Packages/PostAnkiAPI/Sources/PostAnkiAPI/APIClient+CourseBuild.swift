import Foundation

extension APIClient {
    private static func buildPath(_ id: String, _ suffix: String) throws -> String {
        "/curricula/\(encodedSegment(id))/\(suffix)"
    }

    public static func courseBuildList() async throws -> [CourseBuildCourse] {
        try await request("/curricula")
    }

    public static func courseBuildCreate(_ input: CourseBuildCreateInput) async throws -> CourseBuildCourse {
        try await request("/curricula", method: "POST", body: input)
    }

    public static func courseBuildDetail(id: String) async throws -> CourseBuildDetail {
        try await request("/curricula/\(encodedSegment(id))")
    }

    public static func courseBuildApproveSources(id: String, override: Bool) async throws {
        let _: EmptyResponse = try await request(
            try buildPath(id, "approve-sources"),
            method: "POST",
            body: CourseBuildApproveInput(override: override)
        )
    }

    public static func courseBuildDeleteSource(id: String) async throws {
        let _: EmptyResponse = try await request("/sources/\(encodedSegment(id))", method: "DELETE")
    }

    public static func courseBuildAddLinks(id: String, links: [String]) async throws {
        let _: EmptyResponse = try await request(
            try buildPath(id, "sources"),
            method: "POST",
            body: CourseBuildAddSourcesInput(
                curriculumId: id,
                sources: links.map { CourseBuildSourceInput(kind: "link", value: $0) }
            )
        )
    }

    public static func courseBuildTurns(id: String) async throws -> [CourseBuildTurn] {
        try await request(try buildPath(id, "structure-turns"))
    }

    public static func courseBuildSendTurn(id: String, message: String) async throws {
        let _: EmptyResponse = try await request(
            try buildPath(id, "structure-turns"),
            method: "POST",
            body: CourseBuildTurnInput(message: message)
        )
    }

    public static func courseBuildResolveCandidates(id: String, approvedIds: [String]) async throws {
        let _: EmptyResponse = try await request(
            try buildPath(id, "resolve-research-candidates"),
            method: "POST",
            body: CourseBuildResolveInput(approvedCandidateIds: approvedIds)
        )
    }

    public static func courseBuildConfirmStructure(id: String) async throws {
        let _: EmptyResponse = try await request(try buildPath(id, "confirm-structure"), method: "POST")
    }

    public static func courseBuildSetIncluded(topicId: String, included: Bool) async throws {
        let _: EmptyResponse = try await request(
            "/topics/\(encodedSegment(topicId))",
            method: "PATCH",
            body: CourseBuildIncludeInput(included: included)
        )
    }

    public static func courseBuildConfirm(id: String) async throws {
        let _: EmptyResponse = try await request(try buildPath(id, "confirm"), method: "POST")
    }

    public static func courseBuildRetry(id: String, action: String) async throws {
        let _: EmptyResponse = try await request(try buildPath(id, action), method: "POST")
    }
}
