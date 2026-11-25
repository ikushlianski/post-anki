import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Changing a triage item's subject can create the subject first")
    struct FocusTriageSubjectChangeSmokeTests {
        private static let subjects = #"[{"id":"s_a","name":"Physics","description":null,"parentId":null},{"id":"s_b","name":"Optics","description":null,"parentId":"s_a"}]"#

        @Test("should create a subject under a parent and hand back its id and full path without assigning anything")
        func createsWithoutAssigning() async {
            let session = FakeServerSession([
                "/subjects": .json(200, Self.subjects),
                "POST /subjects": .json(201, #"{"id":"s_c","name":"Lenses","description":null,"parentId":"s_a"}"#)
            ])
            defer { session.end() }
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")

            await model.load()
            let created = await model.createSubject(name: "Lenses", parentId: "s_a")

            #expect(created?.id == "s_c")
            #expect(created?.label == "Physics › Lenses")
            #expect(!model.isBusy)
            #expect(FakeServer.writes.map(\.path) == ["/subjects"])
            #expect(FakeServer.writes.first?.bodyObject == ["name": "Lenses", "parentId": "s_a"] as NSDictionary)
        }

        @Test("should show a message and offer no subject when creating the subject fails")
        func createFailureShowsMessage() async {
            let session = FakeServerSession(["POST /subjects": .json(500, #"{"error":"boom"}"#)])
            defer { session.end() }
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")

            let created = await model.createSubject(name: "Lenses", parentId: nil)

            #expect(created == nil)
            #expect(model.message == "Couldn't create the subject. Try again.")
            #expect(!model.isBusy)
        }

        @Test("should offer every subject as a tree after loading so the picker is never blank")
        func treeIsNonEmptyAfterLoad() async {
            let session = FakeServerSession(["/subjects": .json(200, Self.subjects)])
            defer { session.end() }
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")

            #expect(model.loadState == .loading)
            #expect(model.tree.isEmpty)

            await model.load()

            #expect(model.loadState == .loaded)
            #expect(model.tree.map(\.entry.name) == ["Physics"])
            #expect(model.tree.first?.children.map(\.entry.name) == ["Optics"])
        }

        @Test("should show a failed state with an empty tree so the sheet can offer Retry, then recover")
        func failedLoadCanRetry() async {
            let failing = FakeServerSession(["/subjects": .json(500, #"{"error":"boom"}"#)])
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")

            await model.load()
            failing.end()

            #expect(model.loadState == .failed)
            #expect(model.tree.isEmpty)

            let working = FakeServerSession(["/subjects": .json(200, Self.subjects)])
            defer { working.end() }

            await model.load()

            #expect(model.loadState == .loaded)
            #expect(!model.tree.isEmpty)
        }
    }
}
