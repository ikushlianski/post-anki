import Foundation

extension APIClient {
    private static func editCall(
        _ path: String,
        method: String,
        body: Encodable? = nil
    ) async throws {
        let _: EmptyResponse = try await request(path, method: method, body: body)
    }

    public static func courseEditAddModule(curriculumId: String, title: String) async throws {
        try await editCall(
            "/curricula/\(encodedSegment(curriculumId))/modules",
            method: "POST",
            body: CourseEditTitleInput(title: title)
        )
    }

    public static func courseEditRenameModule(id: String, title: String) async throws {
        try await editCall(
            "/modules/\(encodedSegment(id))",
            method: "PATCH",
            body: CourseEditTitleInput(title: title)
        )
    }

    public static func courseEditDeleteModule(id: String) async throws {
        try await editCall("/modules/\(encodedSegment(id))", method: "DELETE")
    }

    public static func courseEditReorderModules(curriculumId: String, orderedIds: [String]) async throws {
        try await editCall(
            "/curricula/\(encodedSegment(curriculumId))/modules/order",
            method: "PATCH",
            body: CourseEditOrderInput(orderedIds: orderedIds)
        )
    }

    public static func courseEditAddTopic(moduleId: String, title: String) async throws {
        try await editCall(
            "/modules/\(encodedSegment(moduleId))/topics",
            method: "POST",
            body: CourseEditTitleInput(title: title)
        )
    }

    public static func courseEditRenameTopic(id: String, title: String) async throws {
        try await editCall(
            "/topics/\(encodedSegment(id))",
            method: "PATCH",
            body: CourseEditTitleInput(title: title)
        )
    }

    public static func courseEditDeleteTopic(id: String) async throws {
        try await editCall("/topics/\(encodedSegment(id))", method: "DELETE")
    }

    public static func courseEditReorderTopics(moduleId: String, orderedIds: [String]) async throws {
        try await editCall(
            "/modules/\(encodedSegment(moduleId))/topics/order",
            method: "PATCH",
            body: CourseEditOrderInput(orderedIds: orderedIds)
        )
    }

    public static func courseEditCommentModule(id: String, comment: String) async throws {
        try await editCall(
            "/modules/\(encodedSegment(id))/comments",
            method: "POST",
            body: CourseEditCommentInput(comment: comment)
        )
    }

    public static func courseEditCommentTopic(id: String, comment: String) async throws {
        try await editCall(
            "/topics/\(encodedSegment(id))/comments",
            method: "POST",
            body: CourseEditCommentInput(comment: comment)
        )
    }
}
