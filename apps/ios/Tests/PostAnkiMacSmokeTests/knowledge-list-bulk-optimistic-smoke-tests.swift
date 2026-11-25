import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Bulk move and delete in the knowledge list change the rows at once and roll back per row")
    struct KnowledgeListBulkOptimisticSmokeTests {
        private static func row(_ id: String, subject: String = "s_a") -> String {
            #"{"knowledgeBitId":"\#(id)","question":"Q \#(id)","answer":"A","subjectId":"\#(subject)","state":"review","dueAt":null,"lapses":0}"#
        }

        private static let page = #"{"items":[\#(row("a")),\#(row("b")),\#(row("c")),\#(row("d"))],"hasMore":false}"#

        private static let target = Wire.decode(Subject.self, #"{"id":"s_b","name":"Beta","description":null,"parentId":null}"#)

        private func make(_ extra: [String: FakeReply]) async -> (KnowledgeListModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/overview": .json(200, Self.page)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = KnowledgeListModel()

            await model.reload()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        private func subjects(_ model: KnowledgeListModel) -> [String: String?] {
            Dictionary(uniqueKeysWithValues: model.items.map { ($0.id, $0.subjectId) })
        }

        @Test("should show the new subject on the selected rows and clear the selection while the move is still held")
        func moveShowsAtOnce() async throws {
            let (model, session) = await make(["POST /knowledge-bits/moves": .held(200, #"{"moved":["a","b"],"skipped":[]}"#)])
            defer { session.end() }

            model.selection = ["a", "b"]
            await model.moveSelected(to: Self.target)

            #expect(subjects(model) == ["a": "s_b", "b": "s_b", "c": "s_a", "d": "s_a"])
            #expect(model.selection.isEmpty)

            model.selection = ["c"]
            await model.moveSelected(to: Self.target)

            #expect(subjects(model)["c"] == "s_b")

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.failure == nil)
        }

        @Test("should put back the old subject only on rows the server skipped and report the skips")
        func partialSkipRollsBackPerRow() async throws {
            let (model, session) = await make([
                "POST /knowledge-bits/moves": .json(200, #"{"moved":["a"],"skipped":[{"id":"b","reason":"not_approved"}]}"#)
            ])
            defer { session.end() }

            model.selection = ["a", "b"]
            await model.moveSelected(to: Self.target)
            await model.settle()

            #expect(subjects(model) == ["a": "s_b", "b": "s_a", "c": "s_a", "d": "s_a"])
            #expect(model.notice == "Moved 1. Skipped 1: 1 not approved.")
        }

        @Test("should restore only the moved rows and say so when a late move fails, leaving other rows alone")
        func lateMoveFailureRestoresOnlyThoseRows() async throws {
            let (model, session) = await make(["POST /knowledge-bits/moves": .held(500, "{}")])
            defer { session.end() }

            model.selection = ["a", "b"]
            await model.moveSelected(to: Self.target)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(subjects(model) == ["a": "s_a", "b": "s_a", "c": "s_a", "d": "s_a"])
            #expect(model.items.map(\.id) == ["a", "b", "c", "d"])
            #expect(model.failure != nil)
        }

        @Test("should remove the confirmed rows and drop them from the selection at once, then confirm with the server")
        func deleteRemovesAtOnce() async throws {
            let (model, session) = await make(["POST /knowledge-bits/deletions": .held(200, #"{"deleted":["a","c"],"skipped":[]}"#)])
            defer { session.end() }

            model.selection = ["a", "c"]
            await model.deleteSelected()

            #expect(model.items.map(\.id) == ["b", "d"])
            #expect(model.selection.isEmpty)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.items.map(\.id) == ["b", "d"])
            #expect(model.notice == "Deleted 2.")
        }

        @Test("should bring back in place only the rows the server refused to delete")
        func partialDeleteRestoresSkippedRows() async throws {
            let (model, session) = await make([
                "POST /knowledge-bits/deletions": .json(200, #"{"deleted":["a"],"skipped":[{"id":"c","reason":"curriculum_placed"}]}"#)
            ])
            defer { session.end() }

            model.selection = ["a", "c"]
            await model.deleteSelected()
            await model.settle()

            #expect(model.items.map(\.id) == ["b", "c", "d"])
            #expect(model.notice == "Deleted 1. Skipped 1: 1 placed in a course.")
        }

        @Test("should bring every row back in its old place when the delete fails and keep the rest untouched")
        func deleteFailureRestoresRows() async throws {
            let (model, session) = await make(["POST /knowledge-bits/deletions": .held(500, "{}")])
            defer { session.end() }

            model.selection = ["a", "c"]
            await model.deleteSelected()

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.items.map(\.id) == ["a", "b", "c", "d"])
            #expect(model.failure != nil)
        }

        @Test("should not bring a pending delete back when the list reloads before the server answers")
        func reloadKeepsPendingDeleteHidden() async throws {
            let (model, session) = await make(["POST /knowledge-bits/deletions": .held(200, #"{"deleted":["a"],"skipped":[]}"#)])
            defer { session.end() }

            model.selection = ["a"]
            await model.deleteSelected()
            await model.reload()

            #expect(model.items.map(\.id) == ["b", "c", "d"])

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()
        }
    }
}
