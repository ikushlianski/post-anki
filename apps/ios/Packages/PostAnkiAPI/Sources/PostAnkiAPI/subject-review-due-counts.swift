import Foundation

public struct SubjectReviewDueCount: Decodable, Sendable, Hashable {
    public let subjectId: String
    public let dueCount: Int
    public let newCount: Int

    public init(subjectId: String, dueCount: Int, newCount: Int) {
        self.subjectId = subjectId
        self.dueCount = dueCount
        self.newCount = newCount
    }
}

public struct SubjectReviewDueCounts: Decodable, Sendable, Hashable {
    public struct Bucket: Decodable, Sendable, Hashable {
        public let dueCount: Int
        public let newCount: Int

        public init(dueCount: Int, newCount: Int) {
            self.dueCount = dueCount
            self.newCount = newCount
        }
    }

    public let subjects: [SubjectReviewDueCount]
    public let unsorted: Bucket
    public let newRemainingToday: Int

    public init(subjects: [SubjectReviewDueCount], unsorted: Bucket, newRemainingToday: Int) {
        self.subjects = subjects
        self.unsorted = unsorted
        self.newRemainingToday = newRemainingToday
    }
}

extension APIClient {
    public static func subjectReviewDueCounts() async throws -> SubjectReviewDueCounts {
        try await request("/subjects/review-due-counts")
    }
}
