import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Changing a triage item's subject assigns it and can create the subject first")
    struct FocusTriageSubjectChangeSmokeTests {
        private static let subjects = #"[{"id":"s_a","name":"Physics","description":null,"parentId":null},{"id":"s_b","name":"Optics","description":null,"parentId":"s_a"}]"#

        @Test("should assign a pending item to a chosen subsubject and report its full path")
        func assignsToSubsubject() async {
            let session = FakeServerSession([
                "/subjects": .json(200, Self.subjects),
                "POST /knowledge-bits/moves": .json(200, #"{"moved":["kb_1"],"skipped":[]}"#)
            ])
            defer { session.end() }
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")

            await model.load()
            let label = await model.assign(subjectId: "s_b")

            #expect(label == "Physics › Optics")
            #expect(FakeServer.writes.first?.bodyObject == ["knowledgeBitIds": ["kb_1"], "subjectId": "s_b"] as NSDictionary)
        }

        @Test("should create a subject under a parent and then assign the item to it")
        func createsThenAssigns() async {
            let session = FakeServerSession([
                "/subjects": .json(200, Self.subjects),
                "POST /subjects": .json(201, #"{"id":"s_c","name":"Lenses","description":null,"parentId":"s_a"}"#),
                "POST /knowledge-bits/moves": .json(200, #"{"moved":["kb_1"],"skipped":[]}"#)
            ])
            defer { session.end() }
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")

            await model.load()
            let label = await model.createAndAssign(name: "Lenses", parentId: "s_a")

            #expect(label == "Physics › Lenses")
            #expect(FakeServer.writes.first?.bodyObject == ["name": "Lenses", "parentId": "s_a"] as NSDictionary)
            #expect(FakeServer.writes.last?.bodyObject == ["knowledgeBitIds": ["kb_1"], "subjectId": "s_c"] as NSDictionary)
        }

        @Test("should keep the old subject and show a message when the item is skipped")
        func skippedKeepsSubject() async {
            let session = FakeServerSession([
                "POST /knowledge-bits/moves": .json(200, #"{"moved":[],"skipped":[{"id":"kb_1","reason":"curriculum_placed"}]}"#)
            ])
            defer { session.end() }
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")

            let label = await model.assign(subjectId: "s_b")

            #expect(label == nil)
            #expect(model.message != nil)
        }
    }
}
