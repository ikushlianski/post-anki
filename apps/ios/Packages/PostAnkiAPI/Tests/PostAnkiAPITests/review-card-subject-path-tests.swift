import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Review card subject")
struct ReviewCardSubjectPathTests {
    private func decode(extra: String) throws -> ReviewCard {
        let json = """
        {"variantId": "v1", "knowledgeBitId": "b1", "kind": "wh_question", "prompt": "p", "answer": "a", \(extra)
         "background": null, "phase": "review", "leech": false,
         "intervalPreview": {"again": 1, "hard": 2, "good": 3, "easy": 4}}
        """

        return try JSONDecoder().decode(ReviewCard.self, from: Data(json.utf8))
    }

    @Test("should show which subject a due card belongs to when the server sends its path")
    func decodesSubjectPath() throws {
        let card = try decode(extra: #""subjectPath": "Business › Sales","#)

        #expect(card.subjectPath == "Business › Sales")
    }

    @Test("should still load a card that has no subject")
    func missingSubjectPath() throws {
        let card = try decode(extra: "")

        #expect(card.subjectPath == nil)
    }
}
