import Foundation

extension APIClient {
    public static func domainMap(subjectId: String) async throws -> [DomainNodeItem] {
        try await request("/subjects/\(encodedSegment(subjectId))/domain-map")
    }

    public static func setDomainNodeDepth(id: String, depth: String?) async throws {
        let _: EmptyResponse = try await request(
            "/domain-nodes/\(encodedSegment(id))",
            method: "PATCH",
            body: UpdateDomainNodeInput(targetDepth: depth)
        )
    }

    public static func mergeDomainNodes(targetId: String, sourceId: String) async throws -> MergeDomainNodesResult {
        try await request(
            "/domain-nodes/\(encodedSegment(targetId))/merge",
            method: "POST",
            body: MergeDomainNodesInput(sourceDomainNodeId: sourceId)
        )
    }

    public static func domainMappings(curriculumId: String) async throws -> [CurriculumDomainMapping] {
        try await request("/curricula/\(encodedSegment(curriculumId))/domain-mappings")
    }

    public static func suggestDomainMappings(curriculumId: String) async throws {
        let _: EmptyResponse = try await request(
            "/curricula/\(encodedSegment(curriculumId))/domain-mappings",
            method: "POST"
        )
    }

    public static func resolveDomainMapping(id: String, confirmed: Bool, depth: String?) async throws {
        let _: EmptyResponse = try await request(
            "/curriculum-domain-mappings/\(encodedSegment(id))",
            method: "PATCH",
            body: ResolveDomainMappingInput(status: confirmed ? "confirmed" : "rejected", depth: confirmed ? depth : nil)
        )
    }

    public static func courseRefocusSuggestions() async throws -> [CourseRefocusSuggestion] {
        try await request("/course-refocus-suggestions")
    }

    public static func dismissCourseRefocus(curriculumId: String, reason: String) async throws {
        let _: EmptyResponse = try await request(
            "/curricula/\(encodedSegment(curriculumId))/refocus-dismissals/\(encodedSegment(reason))",
            method: "PUT"
        )
    }
}
