import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Subject and category edits show at once, save in the background and roll back on failure")
    struct SubjectManageOptimisticSmokeTests {
        private static let subjectsJSON = """
        [{"id":"s_a","name":"Alpha","kind":"architecture-mentor","parentId":null,"sortOrder":0},\
        {"id":"s_b","name":"Beta","kind":"architecture-mentor","parentId":null,"sortOrder":1},\
        {"id":"s_c","name":"Gamma","kind":"architecture-mentor","parentId":null,"sortOrder":2}]
        """

        private static let coursesJSON = """
        [{"id":"c_1","subjectId":"s_b","name":"One","status":"active","categoryId":null},\
        {"id":"c_2","subjectId":"s_b","name":"Two","status":"active","categoryId":null}]
        """

        private static let categoriesJSON = """
        [{"id":"cat_1","subjectId":"s_a","parentId":null,"name":"Basics"},\
        {"id":"cat_2","subjectId":"s_a","parentId":null,"name":"Advanced"}]
        """

        private func make(_ extra: [String: FakeReply]) async -> (SubjectManageModel, FakeServerSession) {
            var routes: [String: FakeReply] = [
                "/subjects": .json(200, Self.subjectsJSON),
                "/curricula": .json(200, Self.coursesJSON)
            ]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = SubjectManageModel()

            await model.load()

            return (model, session)
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        @Test("should show the new name at once and keep the screen usable while the rename is held")
        func renameIsImmediate() async throws {
            let (model, session) = await make([
                "PATCH /subjects/s_a": .held(200, "{}"),
                "PATCH /subjects/s_b": .json(200, "{}")
            ])
            defer { session.end() }

            let accepted = await model.rename(model.subjects[0], to: "Alpha 2")

            #expect(accepted)
            #expect(model.subjects[0].name == "Alpha 2")
            #expect(!model.isWorking)

            try await waitForHeld(1)

            let second = await model.rename(model.subjects[1], to: "Beta 2")

            #expect(second)
            #expect(model.subjects[1].name == "Beta 2")

            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.errorMessage == nil)
        }

        @Test("should put the old name back and say why when a held rename fails, leaving other subjects alone")
        func renameRollsBack() async throws {
            let (model, session) = await make([
                "PATCH /subjects/s_a": .held(401, "{}"),
                "PATCH /subjects/s_b": .json(200, "{}")
            ])
            defer { session.end() }

            _ = await model.rename(model.subjects[0], to: "Alpha 2")
            _ = await model.rename(model.subjects[1], to: "Beta 2")

            #expect(model.subjects.map(\.name) == ["Alpha 2", "Beta 2", "Gamma"])

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.subjects[0].name == "Alpha")
            #expect(model.errorMessage == WriteFailureCase.signedOutMessage)
            #expect(FakeServer.writes.map(\.path) == ["/subjects/s_a", "/subjects/s_b"])
        }

        @Test("should send two quick reorders one after the other so the later order wins")
        func reorderSerialised() async throws {
            let (model, session) = await make([
                "PATCH /subjects/order": .sequence([.held(200, "{}"), .held(200, "{}")])
            ])
            defer { session.end() }

            await model.move(parentId: nil, from: IndexSet(integer: 2), to: 0)

            #expect(model.children(of: nil).map(\.id) == ["s_c", "s_a", "s_b"])

            try await waitForHeld(1)
            await model.move(parentId: nil, from: IndexSet(integer: 2), to: 0)

            #expect(model.children(of: nil).map(\.id) == ["s_b", "s_c", "s_a"])
            #expect(FakeServer.writes.count == 1)

            FakeServer.releaseHeld()
            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            let orders = FakeServer.writes.compactMap { $0.bodyObject?["orderedIds"] as? [String] }

            #expect(orders == [["s_c", "s_a", "s_b"], ["s_b", "s_c", "s_a"]])
            #expect(model.children(of: nil).map(\.id) == ["s_b", "s_c", "s_a"])
        }

        @Test("should show the merge at once, then say how many subjects the server moved")
        func mergeKeepsServerNotice() async throws {
            let (model, session) = await make([
                "POST /subjects/s_a/merge": .held(200, #"{"curriculaMoved":2}"#)
            ])
            defer { session.end() }

            _ = await model.merge(source: model.subjects[1], into: model.subjects[0])

            #expect(model.subjects.map(\.id) == ["s_a", "s_c"])
            #expect(model.notice == nil)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.notice == "Moved 2 subjects.")
        }

        @Test("should remove a confirmed delete at once and bring the subject back when the server refuses")
        func deleteRollsBack() async throws {
            let (model, session) = await make(["DELETE /subjects/s_b": .held(401, "{}")])
            defer { session.end() }

            await model.delete(model.subjects[1])

            #expect(model.subjects.map(\.id) == ["s_a", "s_c"])
            #expect(model.courseCount(of: "s_b") == 0)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(Set(model.subjects.map(\.id)) == ["s_a", "s_b", "s_c"])
            #expect(model.courseCount(of: "s_b") == 2)
            #expect(model.errorMessage == WriteFailureCase.signedOutMessage)
        }

        @Test("should move a category at once and put it back when the held move fails")
        func categoryMoveRollsBack() async throws {
            let session = FakeServerSession([
                "/subjects/s_a/categories": .json(200, Self.categoriesJSON),
                "/curricula": .json(200, Self.coursesJSON),
                "PATCH /subject-categories/cat_1": .held(401, "{}")
            ])
            defer { session.end() }

            let alpha = Wire.decode(
                SubjectManageSubject.self,
                #"{"id":"s_a","name":"Alpha","kind":"architecture-mentor","parentId":null,"sortOrder":0}"#
            )
            let model = SubjectCategoryModel(subject: alpha)

            await model.load()
            await model.move(model.categories[0], into: "cat_2")

            #expect(model.categories[0].parentId == "cat_2")
            #expect(!model.isWorking)

            try await waitForHeld(1)
            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.categories[0].parentId == nil)
            #expect(model.errorMessage == WriteFailureCase.signedOutMessage)
        }
    }
}
