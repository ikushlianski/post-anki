import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Review card note text")
struct ReviewCardSentenceTests {
    private func decode(kind: String, sentence: String?) throws -> ReviewCard {
        let field = sentence.map { #""sentence": "\#($0)","# } ?? ""
        let json = """
        {"variantId": "v1", "knowledgeBitId": "b1", "kind": "\(kind)", "prompt": "p", "answer": "a", \(field)
         "background": null, "phase": "review", "leech": false,
         "intervalPreview": {"again": 1, "hard": 2, "good": 3, "easy": 4}}
        """

        return try JSONDecoder().decode(ReviewCard.self, from: Data(json.utf8))
    }

    @Test("should fill every gap of a cloze note so the back reads as the whole sentence")
    func fillsClozeNote() throws {
        let card = try decode(kind: "cloze", sentence: "{{c1::HTTPS::protocol}} runs on port {{c2::443}}.")

        #expect(card.filledSentence == "HTTPS runs on port 443.")
        #expect(card.noteKind == .cloze)
    }

    @Test("should keep the plain answer when a cloze card arrives without a note text")
    func fallsBackWithoutSentence() throws {
        let card = try decode(kind: "cloze", sentence: nil)

        #expect(card.filledSentence == nil)
        #expect(card.noteKind == nil)
    }

    @Test("should open list cards in the list editor but not fill their back")
    func listCards() throws {
        let card = try decode(kind: "list_step", sentence: "Handshake\\nSYN\\nSYN-ACK\\nACK")

        #expect(card.noteKind == .list)
        #expect(card.filledSentence == nil)
    }

    @Test("should read the rebuilt card of an edited variant from the save response")
    func editedCard() throws {
        let json = #"{"ok": true, "variantId": "v2", "cards": [{"id": "v1", "prompt": "x", "answer": "y"}, {"id": "v2", "prompt": "P", "answer": "A"}]}"#
        let result = try JSONDecoder().decode(EditVariantResult.self, from: Data(json.utf8))

        #expect(result.editedCard == EditedVariantCard(id: "v2", context: nil, prompt: "P", answer: "A"))
    }
}
