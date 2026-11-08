import Foundation

public struct SubjectReviewLimits: Decodable, Sendable, Hashable {
    public let newCardsPerDay: Int
    public let maxReviewsPerDay: Int

    private enum CodingKeys: String, CodingKey { case newCardsPerDay, maxReviewsPerDay }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        newCardsPerDay = container.lenientInt(.newCardsPerDay)
        maxReviewsPerDay = container.lenientInt(.maxReviewsPerDay)
    }

    public init(newCardsPerDay: Int, maxReviewsPerDay: Int) {
        self.newCardsPerDay = newCardsPerDay
        self.maxReviewsPerDay = maxReviewsPerDay
    }
}

public struct SubjectReviewDueCount: Decodable, Sendable, Hashable {
    public let subjectId: String
    public let dueCount: Int
    public let newCount: Int
    public let reviewTodayCount: Int
    public let learningDueCount: Int
    public let todayCount: Int
    public let limits: SubjectReviewLimits?

    private enum CodingKeys: String, CodingKey {
        case subjectId, dueCount, newCount, reviewTodayCount, learningDueCount, todayCount, limits
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        subjectId = try container.decode(String.self, forKey: .subjectId)
        dueCount = container.lenientInt(.dueCount)
        newCount = container.lenientInt(.newCount)
        reviewTodayCount = container.lenientInt(.reviewTodayCount)
        learningDueCount = container.lenientInt(.learningDueCount)
        todayCount = container.lenientInt(.todayCount)
        limits = (try? container.decodeIfPresent(SubjectReviewLimits.self, forKey: .limits)) ?? nil
    }

    public init(
        subjectId: String,
        dueCount: Int,
        newCount: Int,
        reviewTodayCount: Int = 0,
        learningDueCount: Int = 0,
        todayCount: Int = 0,
        limits: SubjectReviewLimits? = nil
    ) {
        self.subjectId = subjectId
        self.dueCount = dueCount
        self.newCount = newCount
        self.reviewTodayCount = reviewTodayCount
        self.learningDueCount = learningDueCount
        self.todayCount = todayCount
        self.limits = limits
    }
}

public struct SubjectReviewDueCounts: Decodable, Sendable, Hashable {
    public struct Bucket: Decodable, Sendable, Hashable {
        public let dueCount: Int
        public let newCount: Int
        public let reviewTodayCount: Int
        public let learningDueCount: Int
        public let todayCount: Int

        private enum CodingKeys: String, CodingKey {
            case dueCount, newCount, reviewTodayCount, learningDueCount, todayCount
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            dueCount = container.lenientInt(.dueCount)
            newCount = container.lenientInt(.newCount)
            reviewTodayCount = container.lenientInt(.reviewTodayCount)
            learningDueCount = container.lenientInt(.learningDueCount)
            todayCount = container.lenientInt(.todayCount)
        }

        public init(
            dueCount: Int,
            newCount: Int,
            reviewTodayCount: Int = 0,
            learningDueCount: Int = 0,
            todayCount: Int = 0
        ) {
            self.dueCount = dueCount
            self.newCount = newCount
            self.reviewTodayCount = reviewTodayCount
            self.learningDueCount = learningDueCount
            self.todayCount = todayCount
        }
    }

    public let subjects: [SubjectReviewDueCount]
    public let unsorted: Bucket
    public let newRemainingToday: Int
    public let reviewsRemainingToday: Int?

    private enum CodingKeys: String, CodingKey { case subjects, unsorted, newRemainingToday, reviewsRemainingToday }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        subjects = (try? container.decodeIfPresent(LossyArray<SubjectReviewDueCount>.self, forKey: .subjects))?.elements ?? []
        unsorted = (try? container.decodeIfPresent(Bucket.self, forKey: .unsorted)) ?? Bucket(dueCount: 0, newCount: 0)
        newRemainingToday = container.lenientInt(.newRemainingToday)
        reviewsRemainingToday = (try? container.decodeIfPresent(Int.self, forKey: .reviewsRemainingToday)) ?? nil
    }

    public init(
        subjects: [SubjectReviewDueCount],
        unsorted: Bucket,
        newRemainingToday: Int,
        reviewsRemainingToday: Int? = nil
    ) {
        self.subjects = subjects
        self.unsorted = unsorted
        self.newRemainingToday = newRemainingToday
        self.reviewsRemainingToday = reviewsRemainingToday
    }
}

extension APIClient {
    public static func subjectReviewDueCounts() async throws -> SubjectReviewDueCounts {
        try await request("/subjects/review-due-counts")
    }
}
