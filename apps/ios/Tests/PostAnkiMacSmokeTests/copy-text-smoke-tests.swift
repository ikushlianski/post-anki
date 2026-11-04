import Foundation
import Testing
@testable import PostAnkiAPI

extension SmokeTests {
    @Suite("Copying triage card text")
    struct CopyTextSmokeTests {
        @Test("should copy a card as the question, a blank line, then the answer")
        func cardText() {
            #expect(CardCopyText.card(question: "What is a vein?", answer: "A blood vessel") == "What is a vein?\n\nA blood vessel")
        }

        @Test("should copy only the side that has text when the other is missing or blank")
        func cardTextSkipsEmptySide() {
            #expect(CardCopyText.card(question: "Q", answer: nil) == "Q")
            #expect(CardCopyText.card(question: "  ", answer: "A") == "A")
        }

        @Test("should copy every non-blank text part of a card separated by blank lines")
        func copyAllJoinsEveryPart() {
            #expect(CardCopyText.all(["Anatomy", "Q", nil, " A ", "  ", "Example"]) == "Anatomy\n\nQ\n\nA\n\nExample")
            #expect(CardCopyText.all([nil, " "]).isEmpty)
        }

        @Test("should include the phrase and AI suggestion in a review card's copy all")
        func reviewCopyAllIncludesAiSuggestion() throws {
            let preview = try JSONDecoder().decode(IntervalPreview.self, from: Data(#"{"again":1,"hard":1,"good":1,"easy":1}"#.utf8))
            let card = ReviewCard(variantId: "v", knowledgeBitId: "kb", kind: "basic", prompt: "Q", answer: "A", background: "Note", phase: "new", leech: false, intervalPreview: preview, aiSuggestion: "better phrase", originalPhrase: "my phrase")
            let text = CardCopyText.all(CardCopyText.reviewParts(card))

            #expect(text.contains("Your phrase: my phrase"))
            #expect(text.contains("AI suggestion: better phrase"))
            #expect(text.hasSuffix("Note"))
        }

        @Test("should include the phrase and AI suggestion in a triage card's copy all and omit them when absent")
        func triageCopyAllIncludesAiSuggestion() {
            let bit = PendingReviewBit(id: "b", body: "my phrase", background: "Ex", origin: "x", variants: [], aiSuggestion: "better phrase")
            let parts = FocusTriageCardParts(bit: bit, source: nil)
            let text = CardCopyText.all(CardCopyText.triageParts(parts, suggestion: bit.aiSuggestion, original: bit.body))

            #expect(text.contains("Your phrase: my phrase\n\nAI suggestion: better phrase"))
            #expect(!CardCopyText.all(CardCopyText.triageParts(parts, suggestion: nil, original: bit.body)).contains("AI suggestion"))
        }

        @Test("should treat a finger resting before the drag as a text selection, not a swipe")
        func holdIsNotSwipe() {
            #expect(FocusTriageSwipe.startsAsHold(heldFor: 0.6))
            #expect(!FocusTriageSwipe.startsAsHold(heldFor: 0.1))
        }
    }
}
