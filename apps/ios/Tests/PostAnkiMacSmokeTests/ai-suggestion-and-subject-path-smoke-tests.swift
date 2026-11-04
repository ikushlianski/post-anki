import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("AI suggestion and subject paths")
    struct AiSuggestionAndSubjectPathSmokeTests {
        private func subject(_ id: String, _ name: String, parent: String? = nil) -> Subject {
            let parentJSON = parent.map { "\"\($0)\"" } ?? "null"
            let json = "{\"id\":\"\(id)\",\"name\":\"\(name)\",\"description\":null,\"parentId\":\(parentJSON)}"

            return try! JSONDecoder().decode(Subject.self, from: Data(json.utf8))
        }

        @Test("should show both the user's phrase and the AI suggestion only when both exist")
        func suggestionShown() {
            let shown = AiSuggestionText.shown(" circuit breaker ", original: "circut breker")

            #expect(shown?.suggestion == "circuit breaker")
            #expect(shown?.original == "circut breker")
            #expect(AiSuggestionText.shown(nil, original: "x") == nil)
            #expect(AiSuggestionText.shown("  ", original: "x") == nil)
            #expect(AiSuggestionText.shown("y", original: nil) == nil)
        }

        @Test("should tell two subjects with the same name apart by full path and mark parents as not selectable")
        func optionsHavePaths() {
            let options = SubjectTreePath.options(from: [
                subject("a", "Business"), subject("b", "Common", parent: "a"),
                subject("c", "Tech"), subject("d", "Common", parent: "c")
            ])

            #expect(options.map(\.label) == ["Business", "Business > Common", "Tech", "Tech > Common"])
            #expect(options.map(\.isParent) == [true, false, true, false])
        }

        @Test("should label the Knowledge subject filter with the full path of the chosen subject")
        @MainActor
        func filterLabel() {
            let model = KnowledgeListModel()

            model.subjects = [subject("a", "Business"), subject("b", "Common", parent: "a")]

            #expect(model.subjectName(for: "b") == "Business > Common")
            #expect(model.subjectName(for: nil) == nil)
        }
    }
}
