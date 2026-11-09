import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Add knowledge remembers the last subject and can create one on the spot")
    struct AddKnowledgeSubjectSmokeTests {
        private final class MemoryStore: LastSubjectStoring {
            var saved: String?

            init(_ saved: String? = nil) { self.saved = saved }

            func load() -> String? { saved }
            func save(_ id: String?) { saved = id }
        }

        private static let subjects = #"[{"id":"s_a","name":"Physics","description":null,"parentId":null}]"#

        @Test("should start on the remembered subject when it still exists")
        func restores() async {
            let session = FakeServerSession(["/subjects": .json(200, Self.subjects)])
            defer { session.end() }

            let model = AddKnowledgeSubjectPickerModel(lastSubject: MemoryStore("s_a"))

            #expect(model.selectedId == "s_a")

            await model.load()

            #expect(model.selectedId == "s_a")
            #expect(model.pathLabel == "Physics")
        }

        @Test("should fall back to no subject and forget it when the remembered one is gone")
        func forgetsMissing() async {
            let session = FakeServerSession(["/subjects": .json(200, Self.subjects)])
            defer { session.end() }

            let store = MemoryStore("s_deleted")
            let model = AddKnowledgeSubjectPickerModel(lastSubject: store)

            await model.load()

            #expect(model.selectedId == nil)
            #expect(store.saved == nil)
        }

        @Test("should remember a newly chosen subject")
        func remembersChoice() {
            let store = MemoryStore()
            let model = AddKnowledgeSubjectPickerModel(lastSubject: store)

            model.selectedId = "s_a"

            #expect(store.saved == "s_a")
        }

        @Test("should create a subject under a parent, select it and remember it")
        func createsAndSelects() async {
            let session = FakeServerSession([
                "/subjects": .json(200, Self.subjects),
                "POST /subjects": .json(201, #"{"id":"s_c","name":"Lenses","description":null,"parentId":"s_a"}"#)
            ])
            defer { session.end() }

            let store = MemoryStore()
            let model = AddKnowledgeSubjectPickerModel(lastSubject: store)

            await model.load()

            let created = await model.createAndSelect(name: "Lenses", parentId: "s_a")

            #expect(created)
            #expect(model.selectedId == "s_c")
            #expect(model.pathLabel == "Physics › Lenses")
            #expect(store.saved == "s_c")
            #expect(FakeServer.writes.first?.bodyObject == ["name": "Lenses", "parentId": "s_a"] as NSDictionary)
        }

        @Test("should keep the current subject and show a message when creating fails")
        func createFails() async {
            let session = FakeServerSession(["POST /subjects": .status(500)])
            defer { session.end() }

            let model = AddKnowledgeSubjectPickerModel(subjects: [], selectedId: nil)

            let created = await model.createAndSelect(name: "Lenses", parentId: nil)

            #expect(!created)
            #expect(model.selectedId == nil)
            #expect(model.message != nil)
        }
    }
}
