import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Subject management writes send the right request and keep the list on failure")
    struct SubjectManageWriteSmokeTests {
        private static let subjectsJSON = """
        [{"id":"s_a","name":"Alpha","kind":"architecture-mentor","parentId":null,"sortOrder":0},\
        {"id":"s_b","name":"Beta","kind":"architecture-mentor","parentId":null,"sortOrder":1},\
        {"id":"s_c","name":"Gamma","kind":"architecture-mentor","parentId":null,"sortOrder":2}]
        """

        private static let alpha = Wire.decode(
            SubjectManageSubject.self,
            #"{"id":"s_a","name":"Alpha","kind":"architecture-mentor","parentId":null,"sortOrder":0}"#
        )

        private static let coursesJSON = """
        [{"id":"c_1","subjectId":"s_b","name":"One","status":"active","categoryId":null},\
        {"id":"c_2","subjectId":"s_b","name":"Two","status":"active","categoryId":null}]
        """

        private nonisolated static let failures: [WriteFailureCase] = [
            .signedOut,
            .rejected("self_merge", message: "A subject can't be merged into itself."),
            .offline
        ]

        private func loadedModel(extra: [String: FakeReply]) async -> (SubjectManageModel, FakeServerSession) {
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

        private func names(_ model: SubjectManageModel) -> [String] {
            model.subjects.map(\.name)
        }

        @Test("should post the new subject name and parent, then reload the list")
        func createSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["POST /subjects": .json(200, "{}")])
            defer { session.end() }

            let created = await model.create(name: "Delta", parentId: "s_a")

            #expect(created)
            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.map(\.path) == ["/subjects"])
            #expect(FakeServer.writes.first?.bodyObject == ["name": "Delta", "parentId": "s_a"] as NSDictionary)
            #expect(model.didChange)
            #expect(FakeServer.requests.filter { $0.method == "GET" && $0.path == "/subjects" }.count == 2)
        }

        @Test("should patch the new name onto the subject")
        func renameSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["PATCH /subjects/s_a": .json(200, "{}")])
            defer { session.end() }

            let renamed = await model.rename(model.subjects[0], to: "Alpha 2")

            #expect(renamed)
            #expect(FakeServer.writes.map(\.method) == ["PATCH"])
            #expect(FakeServer.writes.map(\.path) == ["/subjects/s_a"])
            #expect(FakeServer.writes.first?.bodyObject == ["name": "Alpha 2"] as NSDictionary)
        }

        @Test("should send a delete for the subject and reload")
        func deleteSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["DELETE /subjects/s_c": .json(200, "{}")])
            defer { session.end() }

            await model.delete(model.subjects[2])

            #expect(FakeServer.writes.map(\.method) == ["DELETE"])
            #expect(FakeServer.writes.map(\.path) == ["/subjects/s_c"])
            #expect(FakeServer.writes.first?.body == nil)
            #expect(model.didChange)
        }

        @Test("should post the source subject to the kept one and say how many courses moved")
        func mergeSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["POST /subjects/s_a/merge": .json(200, #"{"curriculaMoved":2}"#)])
            defer { session.end() }

            let merged = await model.merge(source: model.subjects[1], into: model.subjects[0])

            #expect(merged)
            #expect(FakeServer.writes.map(\.path) == ["/subjects/s_a/merge"])
            #expect(FakeServer.writes.first?.bodyObject == ["sourceSubjectId": "s_b"] as NSDictionary)
            #expect(model.notice == "Moved 2 courses.")
        }

        @Test("should send the new order of siblings after a drag")
        func reorderSucceeds() async throws {
            let (model, session) = await loadedModel(extra: ["PATCH /subjects/order": .json(200, "{}")])
            defer { session.end() }

            await model.move(parentId: nil, from: IndexSet(integer: 2), to: 0)

            let body = FakeServer.writes.first?.bodyObject

            #expect(FakeServer.writes.map(\.method) == ["PATCH"])
            #expect(FakeServer.writes.map(\.path) == ["/subjects/order"])
            #expect(body?["orderedIds"] as? [String] == ["s_c", "s_a", "s_b"])
            #expect(model.didChange)
        }

        @Test("should keep the list and explain when creating fails", arguments: failures)
        func createFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["POST /subjects": failure.reply])
            defer { session.end() }

            let before = names(model)
            let created = await model.create(name: "Delta", parentId: nil)

            #expect(!created)
            #expect(model.errorMessage == failure.message)
            #expect(names(model) == before)
            #expect(!model.didChange)
            #expect(!model.isWorking)
        }

        @Test("should keep the old name and explain when renaming fails", arguments: failures)
        func renameFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["PATCH /subjects/s_a": failure.reply])
            defer { session.end() }

            let renamed = await model.rename(model.subjects[0], to: "Alpha 2")

            #expect(!renamed)
            #expect(model.errorMessage == failure.message)
            #expect(model.subjects[0].name == "Alpha")
            #expect(!model.didChange)
        }

        @Test("should keep the subject and explain when deleting fails", arguments: failures)
        func deleteFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["DELETE /subjects/s_c": failure.reply])
            defer { session.end() }

            await model.delete(model.subjects[2])

            #expect(model.errorMessage == failure.message)
            #expect(names(model) == ["Alpha", "Beta", "Gamma"])
            #expect(!model.didChange)
        }

        @Test("should keep both subjects, show no move notice and explain when merging fails", arguments: failures)
        func mergeFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["POST /subjects/s_a/merge": failure.reply])
            defer { session.end() }

            let merged = await model.merge(source: model.subjects[1], into: model.subjects[0])

            #expect(!merged)
            #expect(model.errorMessage == failure.message)
            #expect(model.notice == nil)
            #expect(names(model) == ["Alpha", "Beta", "Gamma"])
            #expect(model.courses.count == 2)
        }

        @Test("should reload the server order and keep the error when reordering fails", arguments: failures)
        func reorderFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedModel(extra: ["PATCH /subjects/order": failure.reply])
            defer { session.end() }

            await model.move(parentId: nil, from: IndexSet(integer: 2), to: 0)

            #expect(model.errorMessage == failure.message)
            #expect(model.children(of: nil).map(\.id) == ["s_a", "s_b", "s_c"])
            #expect(!model.didChange)
        }

        @Test("should post a new category under its subject and reload the categories")
        func categoryCreateSucceeds() async throws {
            let session = FakeServerSession([
                "POST /subjects/s_a/categories": .json(200, "{}"),
                "/subjects/s_a/categories": .json(200, #"[{"id":"cat_1","subjectId":"s_a","parentId":null,"name":"Basics"}]"#),
                "/curricula": .json(200, Self.coursesJSON)
            ])
            defer { session.end() }

            let model = SubjectCategoryModel(subject: Self.alpha)

            let created = await model.create(name: "Basics", parentId: nil)

            #expect(created)
            #expect(FakeServer.writes.first?.bodyObject == ["name": "Basics"] as NSDictionary)
            #expect(model.categories.map(\.name) == ["Basics"])
        }

        @Test("should keep the category list and explain when creating a category fails", arguments: failures)
        func categoryCreateFails(failure: WriteFailureCase) async throws {
            let session = FakeServerSession(["POST /subjects/s_a/categories": failure.reply])
            defer { session.end() }

            let model = SubjectCategoryModel(subject: Self.alpha)

            let created = await model.create(name: "Basics", parentId: nil)

            #expect(!created)
            #expect(model.errorMessage == failure.message)
            #expect(model.categories.isEmpty)
        }
    }
}
