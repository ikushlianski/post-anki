import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review subjects list keeps its rows when a refresh fails")
    struct ReviewSubjectsModelSmokeTests {
        private let subjects: FakeReply = .json(200, "[{\"id\":\"a\",\"name\":\"Algebra\",\"description\":null,\"parentId\":null},{\"id\":\"b\",\"name\":\"Biology\",\"description\":null,\"parentId\":null}]")
        private let counts: FakeReply = .json(200, "[]")
        private let due: FakeReply = .json(200, "{\"subjects\":[{\"subjectId\":\"a\",\"dueCount\":0,\"newCount\":4}],\"unsorted\":{\"dueCount\":0,\"newCount\":0},\"newRemainingToday\":4}")

        private var routes: [String: FakeReply] {
            ["/subjects": subjects, "/knowledge-bits/browser/subjects": counts, "/subjects/review-due-counts": due]
        }

        @Test("should list every subject with its new-card summary")
        func listsRows() async {
            let session = FakeServerSession(routes)
            defer { session.end() }
            let model = ReviewSubjectsModel()

            await model.load()

            #expect(model.rows.map(\.id) == ["a", "b"])
            #expect(model.rows.first?.summary == "4 new")
            #expect(model.rows.last?.summary == "Nothing due")
            #expect(model.totalNew == 4)
            #expect(model.errorMessage == nil)
        }

        @Test("should count a nested card once in the total used for the app badge")
        func totalCountsRootsOnly() async {
            var nested = routes

            nested["/subjects"] = .json(200, "[{\"id\":\"a\",\"name\":\"Business\",\"description\":null,\"parentId\":null},{\"id\":\"b\",\"name\":\"Sales\",\"description\":null,\"parentId\":\"a\"},{\"id\":\"c\",\"name\":\"Cold sales\",\"description\":null,\"parentId\":\"b\"}]")
            nested["/subjects/review-due-counts"] = .json(200, "{\"subjects\":[{\"subjectId\":\"a\",\"dueCount\":4,\"newCount\":0},{\"subjectId\":\"b\",\"dueCount\":4,\"newCount\":0},{\"subjectId\":\"c\",\"dueCount\":4,\"newCount\":0}],\"unsorted\":{\"dueCount\":1,\"newCount\":0},\"newRemainingToday\":0}")

            let session = FakeServerSession(nested)
            defer { session.end() }
            let model = ReviewSubjectsModel()

            await model.load()

            #expect(model.totalDue == 5)
        }

        @Test("should keep the subject rows and show an error when the whole refresh fails")
        func failedLoadKeepsRows() async {
            let session = FakeServerSession(routes)
            defer { session.end() }
            let model = ReviewSubjectsModel()

            await model.load()
            FakeServer.start([:])
            await model.load()

            #expect(model.rows.map(\.id) == ["a", "b"])
            #expect(model.errorMessage != nil)
            #expect(model.hasLoaded)
        }

        @Test("should keep the previous counts and flag only the counts when just the due-count request fails")
        func failedDueCountsKeepsCounts() async {
            let session = FakeServerSession(routes)
            defer { session.end() }
            let model = ReviewSubjectsModel()

            await model.load()

            var partial = routes

            partial["/subjects/review-due-counts"] = .status(500)
            FakeServer.start(partial)
            await model.load()

            #expect(model.rows.first?.newCount == 4)
            #expect(model.dueError != nil)
            #expect(model.errorMessage == nil)
        }

        @Test("should show overall and per-subject card maturity from the browser counts")
        func showsMaturity() async {
            var withCounts = routes

            withCounts["/knowledge-bits/browser/subjects"] = .json(200, "[{\"subjectId\":\"a\",\"count\":10,\"newCount\":2,\"learningCount\":3,\"matureCount\":5},{\"subjectId\":null,\"count\":10,\"newCount\":5,\"learningCount\":0,\"matureCount\":5}]")

            let session = FakeServerSession(withCounts)
            defer { session.end() }
            let model = ReviewSubjectsModel()

            await model.load()

            #expect(model.overallMaturity == CardMaturityBreakdown(new: 7, learning: 3, mature: 10))
            #expect(model.overallMaturity.percentSummary == "50% mature · 15% learning · 35% new")
            #expect(model.rows.first?.maturity.countsSummary == "5 mature · 3 learning · 2 new")
        }

        @Test("should offer Try again instead of a permanent spinner when every attempt is cancelled")
        func repeatedCancelStallsWithRetry() async {
            let session = FakeServerSession(["/subjects": .failure(.cancelled), "/knowledge-bits/browser/subjects": counts, "/subjects/review-due-counts": due])
            defer { session.end() }
            let model = ReviewSubjectsModel()

            await model.load()

            #expect(!model.hasLoaded)
            #expect(model.errorMessage != nil)
        }
    }
}
