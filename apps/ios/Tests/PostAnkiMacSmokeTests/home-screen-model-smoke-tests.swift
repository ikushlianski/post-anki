import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Home keeps the last subject's numbers when a refresh fails")
    struct HomeScreenModelSmokeTests {
        private let detail: FakeReply = .json(200, """
        {"curriculum":{"id":"cur1","subjectId":"s1","name":"Swift","description":null,"status":"ready"},
         "modules":[{"id":"m1","curriculumId":"cur1","title":"Basics","topics":[{"id":"t1","moduleId":"m1","title":"Optionals"},{"id":"t2","moduleId":"m1","title":"Closures"}]}]}
        """)

        private func remember() {
            LastStudied.record(curriculumId: "cur1", curriculumName: "Swift")
        }

        @Test("should show nothing when no subject was studied yet")
        func nothingStudied() async {
            LastStudied.clear()

            let session = FakeServerSession(["/curricula/cur1": detail])
            defer { session.end() }
            let model = HomeScreenModel()

            await model.load()

            #expect(model.detail == nil)
            #expect(model.topics.isEmpty)
            #expect(FakeServer.requested.isEmpty)
        }

        @Test("should list the last studied subject's topics")
        func loadsTopics() async {
            let session = FakeServerSession(["/curricula/cur1": detail])
            defer { session.end() }

            remember()
            defer { LastStudied.clear() }
            let model = HomeScreenModel()

            await model.load()

            #expect(model.curriculumName == "Swift")
            #expect(model.topics.map(\.title) == ["Optionals", "Closures"])
            #expect(model.errorMessage == nil)
            #expect(!model.isLoading)
        }

        @Test("should keep the last numbers and show an error when a refresh fails")
        func failedRefreshKeepsNumbers() async {
            let session = FakeServerSession(["/curricula/cur1": detail])
            defer { session.end() }

            remember()
            defer { LastStudied.clear() }
            let model = HomeScreenModel()

            await model.load()
            FakeServer.start(["/curricula/cur1": .failure(.notConnectedToInternet)])
            await model.load()

            #expect(model.topics.count == 2)
            #expect(model.errorMessage != nil)
            #expect(!model.isLoading)
        }
    }
}
