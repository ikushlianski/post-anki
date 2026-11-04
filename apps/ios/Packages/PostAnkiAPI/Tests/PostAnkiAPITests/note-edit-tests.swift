import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Note editing rules")
struct NoteEditRulesTests {
    @Test("should accept a cloze note with two gap numbers and count two cards")
    func validCloze() {
        #expect(NoteEditRules.validate(.cloze, text: "{{c1::HTTPS}} uses port {{c2::443::number}}.") == .valid(cardCount: 2))
    }

    @Test("should count repeated gap numbers as one card")
    func repeatedNumber() {
        #expect(NoteEditRules.validate(.cloze, text: "{{c1::a}} and {{c1::b}}") == .valid(cardCount: 1))
    }

    @Test("should tell the user to add a gap when a cloze note has none")
    func noGaps() {
        #expect(NoteEditRules.validate(.cloze, text: "Plain text").message == "Add at least one gap like {{c1::answer}}.")
        #expect(NoteEditRules.validate(.cloze, text: "").message == "Add at least one gap like {{c1::answer}}.")
    }

    @Test("should reject unclosed, empty, nested and oversized gaps with plain messages")
    func clozeProblems() {
        #expect(NoteEditRules.validate(.cloze, text: "{{c1::open").message == "A gap is missing its closing }}.")
        #expect(NoteEditRules.validate(.cloze, text: "{{c1:: }}").message == "A gap has no text inside it.")
        #expect(NoteEditRules.validate(.cloze, text: "{{c1::a {{c2::b}} }}").message == "Gaps cannot be placed inside each other.")
        #expect(NoteEditRules.validate(.cloze, text: "{{c1::\(String(repeating: "x", count: 121))}}").message == "A gap can hold at most 120 characters.")
    }

    @Test("should reject more than ten different gap numbers")
    func tooManyGaps() {
        let text = (1...11).map { "{{c\($0)::a}}" }.joined(separator: " ")

        #expect(NoteEditRules.validate(.cloze, text: text).message == "Use at most 10 different gap numbers.")
    }

    @Test("should accept a titled list with numbered steps and count steps plus next-step and overview cards")
    func validList() {
        #expect(NoteEditRules.validate(.list, text: "TCP handshake\n1. SYN\n2) SYN-ACK\n- ACK") == .valid(cardCount: 6))
    }

    @Test("should explain list problems in plain words")
    func listProblems() {
        #expect(NoteEditRules.validate(.list, text: "").message == "Put the list title on the first line.")
        #expect(NoteEditRules.validate(.list, text: "T\na\nb").message == "A list needs at least 3 steps, one per line.")
        #expect(NoteEditRules.validate(.list, text: "T\na\nb\nA ").message == "Each step must be different from the others.")
        #expect(NoteEditRules.validate(.list, text: "T\na\nb\n1.").message == "A step has no text.")
        #expect(NoteEditRules.validate(.list, text: "T\na\nb\n____").message == "Text cannot contain ____.")
        #expect(NoteEditRules.validate(.list, text: "T\n" + (1...9).map { "s\($0)" }.joined(separator: "\n")).message == "A list can hold at most 8 steps.")
    }

    @Test("should only offer the note editor for cloze and list kinds")
    func kinds() {
        #expect(NoteEditKind(cardKind: "cloze") == .cloze)
        #expect(NoteEditKind(cardKind: "list_next") == .list)
        #expect(NoteEditKind(cardKind: "basic") == nil)
    }
}

extension NetworkContracts {
    @Suite("Note edit contract")
    struct NoteEditContractTests {
        @Test("should send a cloze edit as note and a list edit as list")
        func bodies() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"variantId":"v_9","cards":[]}"#.utf8))

            let id = try await APIClient.editQuestionVariantNote(id: "v_1", kind: .cloze, text: "{{c1::a}}")
            #expect(id == "v_9")
            #expect(RecordingStub.last?.method == "PATCH")
            #expect(RecordingStub.last?.path == "/knowledge-bits/question-variants/v_1")
            #expect(RecordingStub.last?.body?["note"] as? String == "{{c1::a}}")
            #expect(RecordingStub.last?.body?["prompt"] == nil)

            _ = try await APIClient.editQuestionVariantNote(id: "v_1", kind: .list, text: "T\na\nb\nc")
            #expect(RecordingStub.last?.body?["list"] as? String == "T\na\nb\nc")
        }

        @Test("should find the note text on the first cloze or list phrasing of an item")
        func noteSource() async throws {
            let json = #"{"phrasings":[{"id":"v1","kind":"basic","sentence":null},{"id":"v2","kind":"list_step","sentence":"T\na\nb\nc"}]}"#
            RecordingStub.install(body: Data(json.utf8))

            let source = try await APIClient.knowledgeBitNoteSource(bitId: "b1")

            #expect(RecordingStub.last?.path == "/knowledge-bits/b1")
            #expect(source == NoteSource(variantId: "v2", kind: .list, text: "T\na\nb\nc"))
        }

        @Test("should expose the note kind only for pending cloze and list variants that carry a sentence")
        func pendingSentence() throws {
            let json = #"[{"id":"a","kind":"cloze","prompt":"p","answer":"a","sentence":"{{c1::a}}"},{"id":"b","kind":"basic","prompt":"p","answer":"a"}]"#
            let variants = try JSONDecoder().decode([PendingReviewVariant].self, from: Data(json.utf8))

            #expect(variants[0].noteKind == .cloze)
            #expect(variants[1].noteKind == nil)
        }
    }
}
