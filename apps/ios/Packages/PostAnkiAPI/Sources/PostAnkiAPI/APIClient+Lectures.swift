import Foundation

extension APIClient {
    public static func lecture(topicId: String) async throws -> Lecture {
        try await request("/topics/\(encodedSegment(topicId))/lecture")
    }

    public static func compileLecture(topicId: String) async throws -> Lecture {
        try await request("/topics/\(encodedSegment(topicId))/lecture", method: "POST")
    }

    public static func findLectureSources(topicId: String) async throws -> [LectureSourceCandidate] {
        try await request("/topics/\(encodedSegment(topicId))/lecture/sources", method: "POST")
    }

    public static func lectureSources(topicId: String) async throws -> [LectureSourceCandidate] {
        try await request("/topics/\(encodedSegment(topicId))/lecture/sources")
    }

    public static func reviewLectureSource(id: String, status: String) async throws -> LectureSourceCandidate {
        try await request(
            "/lecture-source-candidates/\(encodedSegment(id))",
            method: "PATCH",
            body: ReviewLectureSourceInput(reviewStatus: status)
        )
    }

    public static func studyMaterials(topicId: String) async throws -> [StudyMaterial] {
        try await request("/topics/\(encodedSegment(topicId))/study-materials")
    }

    public static func requestStudyMaterial(topicId: String, kind: String) async throws -> StudyMaterial {
        try await request(
            "/topics/\(encodedSegment(topicId))/study-materials",
            method: "POST",
            body: RequestStudyMaterialInput(kind: kind)
        )
    }
}
