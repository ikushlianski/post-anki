import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Course builds and refocus suggestions load from a fake server")
    struct AuthoringSmokeTests {
        @Test("should list only courses still being built, hiding confirmed ones")
        func courseBuildsLoad() async throws {
            let session = FakeServerSession(["/curricula": .fixture("course-builds")])
            defer { session.end() }

            let model = CourseBuildListModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.courses.map(\.id) == ["cur_01", "cur_02"])
            #expect(model.courses.first?.statusLabel == "Choose topics")
            #expect(model.failureKind == nil)
        }

        @Test("should show signed out for course builds on a 401")
        func courseBuildsUnauthorized() async throws {
            let session = FakeServerSession(["/curricula": .status(401)])
            defer { session.end() }

            let model = CourseBuildListModel()

            await model.load()

            #expect(model.failureKind == .unauthorized)
            #expect(!model.hasLoaded)
        }

        @Test("should show offline for course builds when the connection drops, never signed out")
        func courseBuildsOffline() async throws {
            let session = FakeServerSession(["/curricula": .failure(.timedOut)])
            defer { session.end() }

            let model = CourseBuildListModel()

            await model.load()

            #expect(model.failureKind == .offline)
            #expect(!model.hasLoaded)
        }

        @Test("should show only refocus suggestions that were not dismissed")
        func refocusLoads() async throws {
            let session = FakeServerSession(["/course-refocus-suggestions": .fixture("course-refocus-suggestions")])
            defer { session.end() }

            let model = CourseRefocusModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.items.map(\.curriculumId) == ["cur_01"])
            #expect(model.items.first?.courseName == "Distributed systems")
        }

        @Test("should show signed out for refocus suggestions on a 401")
        func refocusUnauthorized() async throws {
            let session = FakeServerSession(["/course-refocus-suggestions": .status(401)])
            defer { session.end() }

            let model = CourseRefocusModel()

            await model.load()

            #expect(model.failureKind == .unauthorized)
            #expect(!model.hasLoaded)
        }

        @Test("should show offline for refocus suggestions when the connection drops")
        func refocusOffline() async throws {
            let session = FakeServerSession(["/course-refocus-suggestions": .failure(.networkConnectionLost)])
            defer { session.end() }

            let model = CourseRefocusModel()

            await model.load()

            #expect(model.failureKind == .offline)
            #expect(!model.hasLoaded)
        }
    }
}
