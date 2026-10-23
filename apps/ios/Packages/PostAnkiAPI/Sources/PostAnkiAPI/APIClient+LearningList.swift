import Foundation

extension APIClient {
    private static func learningItemPath(_ id: String, _ suffix: String = "") throws -> String {
        return "/learning-list-items/\(encodedSegment(id))\(suffix)"
    }

    public static func listLearningItems() async throws -> [LearningListItem] {
        try await request("/learning-list-items")
    }

    public static func getLearningItem(id: String) async throws -> LearningListItem {
        try await request(try learningItemPath(id))
    }

    public static func captureLearningItem(
        url: String,
        kind: String,
        description: String?,
        subjectId: String
    ) async throws -> LearningListItem {
        try await request(
            "/learning-list-items",
            method: "POST",
            body: CaptureLearningItemInput(url: url, kind: kind, pastedDescription: description, subjectId: subjectId)
        )
    }

    public static func decideLearningItem(id: String, approve: Bool) async throws -> LearningListDecisionResult {
        let path = try learningItemPath(id, "/recommendation")
        let body = LearningListDecisionInput(decision: approve ? "approve" : "decline")

        if approve {
            return try await request(path, method: "PATCH", body: body)
        }

        let item: LearningListItem = try await request(path, method: "PATCH", body: body)

        return LearningListDecisionResult(item: item, curriculumId: nil)
    }

    public static func chooseLearningDestination(id: String, destination: String) async throws -> LearningListDecisionResult {
        try await request(
            try learningItemPath(id, "/destination"),
            method: "PATCH",
            body: LearningListDestinationInput(destination: destination)
        )
    }

    public static func classifyLearningItem(id: String, subjectId: String) async throws -> LearningListItem {
        try await request(
            try learningItemPath(id, "/classification"),
            method: "POST",
            body: LearningListClassificationInput(subjectId: subjectId)
        )
    }
}
