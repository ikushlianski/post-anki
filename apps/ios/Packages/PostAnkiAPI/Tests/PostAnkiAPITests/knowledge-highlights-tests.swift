import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Knowledge highlights")
struct KnowledgeHighlightsTests {
    private func range(_ start: Int, _ end: Int) -> KnowledgeHighlight { KnowledgeHighlight(start: start, end: end) }

    @Test("should merge overlapping and adjacent marks into one sorted list")
    func merges() {
        let result = KnowledgeHighlights.merged([range(20, 30), range(0, 5), range(4, 10), range(10, 12)])

        #expect(result == [range(0, 12), range(20, 30)])
    }

    @Test("should ignore an empty selection and clamp a selection past the text")
    func addingClamps() {
        #expect(KnowledgeHighlights.adding(range(3, 3), to: [], textLength: 10).isEmpty)
        #expect(KnowledgeHighlights.adding(range(5, 99), to: [], textLength: 10) == [range(5, 10)])
    }

    @Test("should refuse a 21st separate highlight so the server never rejects the request")
    func capsAtTwenty() {
        let existing = (0..<KnowledgeHighlights.max).map { range($0 * 4, $0 * 4 + 2) }

        #expect(KnowledgeHighlights.adding(range(500, 502), to: existing, textLength: 1000) == existing)
    }

    @Test("should move marks after an insertion and drop a mark whose text was deleted")
    func shiftsOnEdit() {
        let marks = [range(6, 11)]

        #expect(KnowledgeHighlights.shifted(from: "Hello world", to: "Oh Hello world", marks) == [range(9, 14)])
        #expect(KnowledgeHighlights.shifted(from: "Hello world", to: "Hello ", marks).isEmpty)
        #expect(KnowledgeHighlights.shifted(from: "Hello world", to: "Hello world!", marks) == marks)
    }

    @Test("should count emoji as two units so offsets match what the server measures")
    func utf16Offsets() {
        let marks = [range(3, 8)]

        #expect(KnowledgeHighlights.shifted(from: "😀 hello", to: "😀😀 hello", marks) == [range(5, 10)])
        #expect(KnowledgeHighlights.excerpt(of: "😀 hello", range(3, 8)) == "hello")
    }

    @Test("should shift marks left by the leading whitespace the app trims before sending")
    func trimsToSentText() {
        let value = "  \n Hello world  "

        #expect(KnowledgeHighlights.trimmed([range(10, 15)], for: value) == [range(6, 11)])
        #expect(KnowledgeHighlights.trimmed([range(0, 4)], for: value).isEmpty)
        #expect(KnowledgeHighlights.trimmed([range(10, 17)], for: value) == [range(6, 11)])
    }

    @Test("should shorten a long highlight to a one-line excerpt")
    func excerptShortens() {
        let text = "one\n\ntwo   three " + String(repeating: "x", count: 60)

        #expect(KnowledgeHighlights.excerpt(of: text, range(0, 17)) == "one two three")
        #expect(KnowledgeHighlights.excerpt(of: text, range(0, text.utf16.count), maxChars: 10) == "one two th…")
    }
}
