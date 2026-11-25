import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Source, gap and course lists drop the row at once and bring back only that row on a late failure")
    struct ListRowsOptimisticSmokeTests {
        private static let refocus = """
        [{"curriculumId":"cur_01","subjectId":"sub_01","subjectName":"System design","courseName":"A","reason":"stale_top_priority","dismissedAt":null},\
        {"curriculumId":"cur_02","subjectId":"sub_01","subjectName":"System design","courseName":"B","reason":"stale_top_priority","dismissedAt":null}]
        """

        private func waitForHeld() async throws {
            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }
        }

        @Test("should remove the dismissed course suggestion at once and keep the other one when the late save fails")
        func refocusLateFailure() async throws {
            let session = FakeServerSession([
                "/course-refocus-suggestions": .json(200, Self.refocus),
                "PUT /curricula/cur_01/refocus-dismissals/stale_top_priority": .held(500, "{}")
            ])
            defer { session.end() }
            let model = CourseRefocusModel()

            await model.load()

            let first = model.items[0]

            await model.dismiss(first)

            #expect(model.items.map(\.curriculumId) == ["cur_02"])

            try await waitForHeld()
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.items.map(\.curriculumId) == ["cur_01", "cur_02"])
            #expect(model.notice != nil)
        }

        @Test("should not reload the whole course list after a dismissal succeeds")
        func refocusDismissDoesNotReload() async throws {
            let session = FakeServerSession([
                "/course-refocus-suggestions": .json(200, Self.refocus),
                "PUT /curricula/cur_01/refocus-dismissals/stale_top_priority": .status(200)
            ])
            defer { session.end() }
            let model = CourseRefocusModel()

            await model.load()
            await model.dismiss(model.items[0])
            await model.settle()

            #expect(FakeServer.requests.filter { $0.path == "/course-refocus-suggestions" }.count == 1)
            #expect(model.items.map(\.curriculumId) == ["cur_02"])
        }

        @Test("should remove a confirmed source at once and bring it back in place with a message when the delete fails")
        func sourceDeleteLateFailure() async throws {
            let session = FakeServerSession([
                "/sources": .fixture("library-sources"),
                "DELETE /sources/src_01": .held(500, "{}")
            ])
            defer { session.end() }
            let model = SourceLibraryModel()

            await model.load()

            let before = model.groups.flatMap(\.sources).map(\.id)
            let target = model.groups.flatMap(\.sources).first { $0.id == "src_01" }!

            await model.delete(target)

            #expect(!model.groups.flatMap(\.sources).map(\.id).contains("src_01"))

            try await waitForHeld()
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.groups.flatMap(\.sources).map(\.id) == before)
            #expect(model.rowMessages["src_01"] != nil)
        }
    }
}
