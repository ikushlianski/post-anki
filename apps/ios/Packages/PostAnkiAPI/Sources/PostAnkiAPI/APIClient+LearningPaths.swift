import Foundation

extension APIClient {
    public static func listRoleTemplates() async throws -> [RoleTemplate] {
        try await request("/role-templates")
    }

    public static func listLearningPaths() async throws -> [LearningPath] {
        try await request("/learning-paths")
    }

    public static func startLearningPath(roleTemplateId: String) async throws -> LearningPath {
        let result: StartLearningPathResult = try await request(
            "/learning-paths",
            method: "POST",
            body: StartLearningPathInput(roleTemplateId: roleTemplateId)
        )

        return result.path
    }

    public static func getLearningPath(id: String) async throws -> LearningPathDetail {
        try await request(try learningPathURL(id))
    }

    public static func abandonLearningPath(id: String) async throws -> LearningPath {
        try await request(
            try learningPathURL(id),
            method: "PATCH",
            body: AbandonLearningPathInput(status: "abandoned")
        )
    }

    private static func learningPathURL(_ id: String) throws -> String {
        return "/learning-paths/\(encodedSegment(id))"
    }
}
