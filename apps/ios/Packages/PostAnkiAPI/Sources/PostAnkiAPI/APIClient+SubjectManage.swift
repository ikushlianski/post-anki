import Foundation

extension APIClient {
    public static func manageSubjects() async throws -> [SubjectManageSubject] {
        try await request("/subjects")
    }

    public static func organizeCourses() async throws -> [SubjectManageCourse] {
        try await request("/curricula")
    }

    public static func createManagedSubject(name: String, parentId: String?) async throws {
        let _: EmptyResponse = try await request(
            "/subjects",
            method: "POST",
            body: SubjectManageCreateInput(name: name, parentId: parentId)
        )
    }

    public static func renameSubject(id: String, name: String) async throws {
        let _: EmptyResponse = try await request(
            "/subjects/\(encodedSegment(id))",
            method: "PATCH",
            body: SubjectManageRenameInput(name: name)
        )
    }

    public static func reorderSubjects(parentId: String?, orderedIds: [String]) async throws {
        let _: EmptyResponse = try await request(
            "/subjects/order",
            method: "PATCH",
            body: SubjectManageOrderInput(parentId: parentId, orderedIds: orderedIds)
        )
    }

    public static func deleteSubject(id: String) async throws {
        let _: EmptyResponse = try await request("/subjects/\(encodedSegment(id))", method: "DELETE")
    }

    public static func mergeSubject(into keepId: String, from sourceId: String) async throws -> SubjectManageMergeResult {
        try await request(
            "/subjects/\(encodedSegment(keepId))/merge",
            method: "POST",
            body: SubjectManageMergeInput(sourceSubjectId: sourceId)
        )
    }

    public static func subjectCategories(subjectId: String) async throws -> [SubjectCategory] {
        try await request("/subjects/\(encodedSegment(subjectId))/categories")
    }

    public static func createSubjectCategory(subjectId: String, name: String, parentId: String?) async throws {
        let _: EmptyResponse = try await request(
            "/subjects/\(encodedSegment(subjectId))/categories",
            method: "POST",
            body: SubjectCategoryCreateInput(name: name, parentId: parentId)
        )
    }

    public static func moveSubjectCategory(id: String, parentId: String?) async throws {
        let _: EmptyResponse = try await request(
            "/subject-categories/\(encodedSegment(id))",
            method: "PATCH",
            body: SubjectCategoryMoveInput(parentId: parentId)
        )
    }

    public static func renameSubjectCategory(id: String, name: String) async throws {
        let _: EmptyResponse = try await request(
            "/subject-categories/\(encodedSegment(id))/name",
            method: "PATCH",
            body: SubjectCategoryRenameInput(name: name)
        )
    }

    public static func setCourseCategory(courseId: String, subjectId: String, categoryId: String?) async throws {
        let _: EmptyResponse = try await request(
            "/curricula/\(encodedSegment(courseId))/move",
            method: "POST",
            body: SubjectCategoryCourseMoveInput(targetSubjectId: subjectId, categoryId: categoryId)
        )
    }
}
