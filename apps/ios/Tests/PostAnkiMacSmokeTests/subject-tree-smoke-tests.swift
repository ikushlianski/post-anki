import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Subject tree")
    struct SubjectTreeSmokeTests {
        private func subject(_ id: String, _ name: String, parent: String? = nil) -> Subject {
            let parentJSON = parent.map { "\"\($0)\"" } ?? "null"
            let json = "{\"id\":\"\(id)\",\"name\":\"\(name)\",\"description\":null,\"parentId\":\(parentJSON)}"

            return try! JSONDecoder().decode(Subject.self, from: Data(json.utf8))
        }

        private func count(_ id: String?, new: Int, learning: Int, mature: Int) -> KnowledgeBrowserSubjectCount {
            KnowledgeBrowserSubjectCount(
                subjectId: id, count: new + learning + mature, newCount: new, learningCount: learning, matureCount: mature
            )
        }

        @Test("should show a parent with its own cards plus every card in its sub-subjects")
        func rollsUpDescendants() throws {
            let tree = SubjectTree.build(
                subjects: [subject("root", "Databases"), subject("a", "Indexes", parent: "root"), subject("b", "B-trees", parent: "a")],
                counts: [count("root", new: 1, learning: 1, mature: 2), count("a", new: 3, learning: 0, mature: 0), count("b", new: 0, learning: 2, mature: 1)]
            )
            let root = try #require(tree.first)

            #expect(tree.count == 1)
            #expect(root.entry.count == 10)
            #expect(root.entry.newCount == 4)
            #expect(root.entry.learningCount == 3)
            #expect(root.entry.matureCount == 3)
            #expect(root.children.first?.entry.count == 6)
        }

        @Test("should list subjects alphabetically and put a subject whose parent is missing at the top level")
        func ordersAndKeepsOrphans() {
            let tree = SubjectTree.build(
                subjects: [subject("z", "Zoology"), subject("o", "Orphan", parent: "gone"), subject("a", "algebra")],
                counts: []
            )

            #expect(tree.map(\.entry.name) == ["algebra", "Orphan", "Zoology"])
        }

        @Test("should add a No subject row only when unsorted cards exist and place it last")
        func unsortedRow() throws {
            let with = SubjectTree.build(subjects: [subject("a", "Alpha")], counts: [count(nil, new: 2, learning: 0, mature: 0)])
            let without = SubjectTree.build(subjects: [subject("a", "Alpha")], counts: [count(nil, new: 0, learning: 0, mature: 0)])

            #expect(with.last?.entry.name == "No subject")
            #expect(with.last?.entry.isUnsorted == true)
            #expect(with.last?.entry.count == 2)
            #expect(without.map(\.entry.name) == ["Alpha"])
        }

        @Test("should not loop forever when subjects point at each other as parents")
        func survivesCycles() {
            let tree = SubjectTree.build(
                subjects: [subject("a", "A", parent: "b"), subject("b", "B", parent: "a"), subject("c", "C", parent: "c")],
                counts: [count("a", new: 1, learning: 0, mature: 0)]
            )

            #expect(tree.map(\.entry.name) == ["C"])
        }

        @Test("should show children only under expanded parents")
        func expansion() {
            let tree = SubjectTree.build(
                subjects: [subject("r", "Root"), subject("c", "Child", parent: "r")],
                counts: []
            )
            let collapsed = SubjectTree.visibleRows(tree, expanded: [])
            let expanded = SubjectTree.visibleRows(tree, expanded: ["r"])

            #expect(collapsed.map(\.id) == ["r"])
            #expect(expanded.map(\.id) == ["r", "c"])
            #expect(expanded.map(\.depth) == [0, 1])
            #expect(expanded.first?.isExpanded == true)
        }

        @Test("should size the depth bar segments by share of the cards and stay empty with no cards")
        func barFractions() throws {
            let entry = try #require(SubjectTree.build(
                subjects: [subject("a", "A")],
                counts: [count("a", new: 1, learning: 1, mature: 2)]
            ).first?.entry)
            let empty = try #require(SubjectTree.build(subjects: [subject("a", "A")], counts: []).first?.entry)

            #expect(SubjectDepthFractions(entry: entry).mature == 0.5)
            #expect(SubjectDepthFractions(entry: entry).learning == 0.25)
            #expect(SubjectDepthFractions(entry: entry).new == 0.25)
            #expect(SubjectDepthFractions(entry: empty).mature == 0)
        }
    }
}
