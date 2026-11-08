import Foundation
import Testing
@testable import PostAnkiAPI

struct ReviewSubjectsProductionShapeTests {
    @Test func subjectListSurvivesNullNamesDuplicatesAndBrokenRows() throws {
        let subjects = try Fixture.decode(LossyArray<Subject>.self, "subjects-production-shape").elements

        #expect(subjects.map(\.id) == ["s_root", "s_child", "s_root"])
        #expect(subjects[1].name == "Untitled subject")
        #expect(subjects[1].parentId == "s_root")
    }

    @Test func dueCountsStillLoadWhenFieldsAreNullMissingOrFractional() throws {
        let counts = try Fixture.decode(SubjectReviewDueCounts.self, "subject-review-due-counts-production-shape")

        #expect(counts.subjects.map(\.subjectId) == ["s_root", "s_child", "s_empty"])
        #expect(counts.subjects.map(\.dueCount) == [12, 0, 0])
        #expect(counts.subjects.map(\.newCount) == [3, 4_000_000, 0])
        #expect(counts.unsorted == SubjectReviewDueCounts.Bucket(dueCount: 0, newCount: 0))
        #expect(counts.newRemainingToday == 0)
    }

    @Test func olderDueCountsDefaultTodayFieldsToZeroAndNil() throws {
        let counts = try Fixture.decode(SubjectReviewDueCounts.self, "subject-review-due-counts-production-shape")

        #expect(counts.subjects.allSatisfy { $0.todayCount == 0 && $0.reviewTodayCount == 0 && $0.learningDueCount == 0 && $0.limits == nil })
        #expect(counts.reviewsRemainingToday == nil)
        #expect(counts.unsorted.todayCount == 0)
    }

    @Test func newDueCountFieldsDecodeAndTolerateBadValues() throws {
        let json = #"{"subjects":[{"subjectId":"a","dueCount":5,"newCount":2,"reviewTodayCount":3,"learningDueCount":1,"todayCount":6,"limits":{"newCardsPerDay":20,"maxReviewsPerDay":100}},{"subjectId":"b","dueCount":0,"newCount":0,"todayCount":"4.4","limits":"oops"}],"unsorted":{"dueCount":1,"newCount":0,"todayCount":1,"reviewTodayCount":1,"learningDueCount":0},"newRemainingToday":3,"reviewsRemainingToday":42}"#
        let counts = try JSONDecoder().decode(SubjectReviewDueCounts.self, from: Data(json.utf8))

        #expect(counts.subjects[0].todayCount == 6)
        #expect(counts.subjects[0].reviewTodayCount == 3)
        #expect(counts.subjects[0].learningDueCount == 1)
        #expect(counts.subjects[0].limits == SubjectReviewLimits(newCardsPerDay: 20, maxReviewsPerDay: 100))
        #expect(counts.subjects[1].todayCount == 4)
        #expect(counts.subjects[1].limits == nil)
        #expect(counts.unsorted.todayCount == 1)
        #expect(counts.reviewsRemainingToday == 42)
    }

    @Test func browserCountsDeriveLearningWhenMissingAndSkipBrokenRows() throws {
        let rows = try Fixture.decode(LossyArray<KnowledgeBrowserSubjectCount>.self, "knowledge-browser-subjects-production-shape").elements

        #expect(rows.count == 3)
        #expect(rows[0].learningCount == 1)
        #expect(rows[1].count == 3)
        #expect(rows[1].newCount == 0)
        #expect(rows[2].subjectId == nil)
    }

    @Test func failureReasonNamesTheBrokenField() {
        let data = Data(#"{"subjects": 5}"#.utf8)

        do {
            _ = try JSONDecoder().decode(Wrapper.self, from: data)
            Issue.record("expected failure")
        } catch {
            #expect(LoadFailureReason.describe(error) == "decoding: wrong type .subjects")
        }
    }

    @Test func bracketedFailureShowsServerOrNetworkCause() {
        #expect(LoadFailureReason.bracketed(APIError.unauthorized) == "[HTTP 401: unauthorized]")
        #expect(LoadFailureReason.bracketed(APIError.badStatus(500, "boom")) == "[HTTP 500: boom]")
        #expect(LoadFailureReason.bracketed(APIError.badStatus(502, nil)) == "[HTTP 502]")
        #expect(LoadFailureReason.bracketed(URLError(.networkConnectionLost)) == "[\(URLError(.networkConnectionLost).localizedDescription)]")
    }

    private struct Wrapper: Decodable {
        let subjects: [String]
    }
}
