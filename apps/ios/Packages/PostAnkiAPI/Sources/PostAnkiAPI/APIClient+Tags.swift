import Foundation

extension APIClient {
    private static func tagPath(_ id: String, _ suffix: String) throws -> String {
        return "/tags/\(encodedSegment(id))/\(suffix)"
    }

    public static func listTags() async throws -> [Tag] {
        try await request("/tags")
    }

    public static func tagMastery() async throws -> [TagMastery] {
        try await request("/tags/mastery")
    }

    public static func tagNodes(tagId: String) async throws -> TagNodes {
        try await request(try tagPath(tagId, "nodes"))
    }

    public static func createTag(name: String) async throws -> Tag {
        try await request("/tags", method: "POST", body: CreateTagInput(name: name))
    }

    public static func assignTag(tagId: String, topicId: String) async throws {
        let _: TagAssignment = try await request(
            try tagPath(tagId, "assignments"),
            method: "POST",
            body: AssignTagInput(nodeType: "topic", nodeId: topicId)
        )
    }

    public static func mergeTag(keepId: String, sourceId: String) async throws -> MergeTagResult {
        try await request(
            try tagPath(keepId, "merge"),
            method: "POST",
            body: MergeTagInput(sourceTagId: sourceId)
        )
    }
}
