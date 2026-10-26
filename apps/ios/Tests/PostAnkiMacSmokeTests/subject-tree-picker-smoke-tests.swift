import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Subject tree picker")
    struct SubjectTreePickerSmokeTests {
        private func subject(_ id: String, _ name: String, parent: String? = nil) -> Subject {
            let parentJSON = parent.map { "\"\($0)\"" } ?? "null"
            let json = "{\"id\":\"\(id)\",\"name\":\"\(name)\",\"description\":null,\"parentId\":\(parentJSON)}"

            return try! JSONDecoder().decode(Subject.self, from: Data(json.utf8))
        }

        @Test("should show the chosen sub-subject as its full path from the top subject")
        func buildsPath() {
            let tree = SubjectTreePath.tree(from: [
                subject("a", "Swift"), subject("b", "Concurrency", parent: "a"), subject("c", "Actors", parent: "b")
            ])

            #expect(SubjectTreePath.label(for: "c", in: tree) == "Swift > Concurrency > Actors")
            #expect(SubjectTreePath.label(for: "a", in: tree) == "Swift")
        }

        @Test("should show no path when nothing is chosen or the subject is gone")
        func noPath() {
            let tree = SubjectTreePath.tree(from: [subject("a", "Swift")])

            #expect(SubjectTreePath.label(for: nil, in: tree) == nil)
            #expect(SubjectTreePath.label(for: "missing", in: tree) == nil)
        }

        @Test("should keep the flat picker when no subject has sub-subjects")
        func detectsHierarchy() {
            let flat = SubjectTreePath.tree(from: [subject("a", "Alpha"), subject("b", "Beta")])
            let nested = SubjectTreePath.tree(from: [subject("a", "Alpha"), subject("b", "Beta", parent: "a")])

            #expect(!SubjectTreePath.hasChildren(flat))
            #expect(SubjectTreePath.hasChildren(nested))
        }
    }
}
