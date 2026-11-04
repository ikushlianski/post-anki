import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Global search clears on empty text and keeps results when a search fails")
    struct GlobalSearchModelSmokeTests {
        private let found: FakeReply = .json(200, "{\"subjects\":[{\"id\":\"s1\",\"label\":\"Swift\"}],\"curricula\":[],\"topics\":[]}")

        @Test("should show results for a typed query")
        func showsResults() async {
            let session = FakeServerSession(["/search": found])
            defer { session.end() }
            let model = GlobalSearchModel()

            model.query = "swift"
            await model.runSearch()

            #expect(model.everything?.subjects.map(\.id) == ["s1"])
            #expect(model.hasResults)
            #expect(!model.isLoading)
        }

        @Test("should clear results and any error as soon as the query is emptied")
        func emptyQueryClears() async {
            let session = FakeServerSession(["/search": found])
            defer { session.end() }
            let model = GlobalSearchModel()

            model.query = "swift"
            await model.runSearch()
            model.query = "   "
            model.scheduleSearch()

            #expect(model.everything == nil)
            #expect(model.ranked == nil)
            #expect(model.errorMessage == nil)
            #expect(!model.hasSearched)
            #expect(FakeServer.requested.count == 1)
        }

        @Test("should keep the previous results and show an error when a search fails")
        func failedSearchKeepsResults() async {
            let session = FakeServerSession(["/search": found])
            defer { session.end() }
            let model = GlobalSearchModel()

            model.query = "swift"
            await model.runSearch()
            FakeServer.start(["/search": .failure(.notConnectedToInternet)])
            model.query = "swift2"
            await model.runSearch()

            #expect(model.everything?.subjects.map(\.id) == ["s1"])
            #expect(model.errorMessage != nil)
            #expect(!model.isLoading)
        }
    }
}

extension SmokeTests {
    @MainActor
    @Suite("Global search subject courses report load failures instead of an empty list")
    struct GlobalSearchCoursesSmokeTests {
        private let curricula: FakeReply = .json(200, "[{\"id\":\"c1\",\"subjectId\":\"s1\",\"name\":\"Swift\",\"description\":null,\"status\":\"ready\"},{\"id\":\"c2\",\"subjectId\":\"s2\",\"name\":\"Rust\",\"description\":null,\"status\":\"ready\"}]")

        @Test("should list only the courses of the chosen subject")
        func filtersBySubject() async throws {
            let session = FakeServerSession(["/curricula": curricula])
            defer { session.end() }

            let courses = try await GlobalSearchModel().courses(of: "s1")

            #expect(courses.map(\.id) == ["c1"])
        }

        @Test("should throw when the course list cannot be loaded so the screen can show an error")
        func failureThrows() async {
            let session = FakeServerSession(["/curricula": .failure(.notConnectedToInternet)])
            defer { session.end() }

            await #expect(throws: (any Error).self) { try await GlobalSearchModel().courses(of: "s1") }
        }

        @Test("should return an empty list, not an error, when the subject has no courses")
        func emptyIsNotAnError() async throws {
            let session = FakeServerSession(["/curricula": curricula])
            defer { session.end() }

            let courses = try await GlobalSearchModel().courses(of: "none")

            #expect(courses.isEmpty)
        }
    }
}

extension SmokeTests {
    @MainActor
    @Suite("Opening a search result course tells a failed load apart from a missing course")
    struct GlobalSearchOpenCourseSmokeTests {
        private let curricula: FakeReply = .json(200, "[{\"id\":\"c1\",\"subjectId\":\"s1\",\"name\":\"Swift\",\"description\":null,\"status\":\"ready\"}]")

        @Test("should open the course when it is in the list")
        func opensExisting() async {
            let session = FakeServerSession(["/curricula": curricula])
            defer { session.end() }
            let model = GlobalSearchModel()

            await model.openCurriculum(id: "c1")

            #expect(model.openedCurriculum?.id == "c1")
            #expect(model.openMessage == nil)
        }

        @Test("should say the course may have been removed when the list loads without it")
        func missingCourse() async {
            let session = FakeServerSession(["/curricula": curricula])
            defer { session.end() }
            let model = GlobalSearchModel()

            await model.openCurriculum(id: "gone")

            #expect(model.openedCurriculum == nil)
            #expect(model.openMessage?.contains("removed") == true)
        }

        @Test("should say loading failed, not removed, when the course list cannot be fetched")
        func fetchFailure() async {
            let session = FakeServerSession(["/curricula": .failure(.notConnectedToInternet)])
            defer { session.end() }
            let model = GlobalSearchModel()

            await model.openCurriculum(id: "c1")

            #expect(model.openedCurriculum == nil)
            #expect(model.openMessage?.contains("removed") == false)
            #expect(model.openMessage?.contains("load") == true)
        }
    }
}

extension SmokeTests {
    @MainActor
    @Suite("Opening a search result topic tells a failed load apart from a missing topic")
    struct GlobalSearchOpenTopicSmokeTests {
        private let detail: FakeReply = .json(200, """
        {"curriculum":{"id":"cur1","subjectId":"s1","name":"Swift","description":null,"status":"ready"},
         "modules":[{"id":"m1","curriculumId":"cur1","title":"Basics","topics":[{"id":"t1","moduleId":"m1","title":"Optionals"}]}]}
        """)

        @Test("should open the topic when its course contains it")
        func opensExisting() async {
            let session = FakeServerSession(["/curricula/cur1": detail])
            defer { session.end() }
            let model = GlobalSearchModel()

            await model.openTopic(id: "t1", curriculumId: "cur1")

            #expect(model.openedTopic?.id == "t1")
            #expect(model.openMessage == nil)
        }

        @Test("should say the topic may have been removed when the course loads without it")
        func missingTopic() async {
            let session = FakeServerSession(["/curricula/cur1": detail])
            defer { session.end() }
            let model = GlobalSearchModel()

            await model.openTopic(id: "gone", curriculumId: "cur1")

            #expect(model.openedTopic == nil)
            #expect(model.openMessage?.contains("removed") == true)
        }

        @Test("should say the topic may have been removed when the result has no course")
        func missingCourseId() async {
            let model = GlobalSearchModel()

            await model.openTopic(id: "t1", curriculumId: nil)

            #expect(model.openedTopic == nil)
            #expect(model.openMessage?.contains("removed") == true)
        }

        @Test("should say loading failed, not removed, when the course cannot be fetched")
        func fetchFailure() async {
            let session = FakeServerSession(["/curricula/cur1": .failure(.notConnectedToInternet)])
            defer { session.end() }
            let model = GlobalSearchModel()

            await model.openTopic(id: "t1", curriculumId: "cur1")

            #expect(model.openedTopic == nil)
            #expect(model.openMessage?.contains("removed") == false)
            #expect(model.openMessage?.contains("load") == true)
        }
    }
}
