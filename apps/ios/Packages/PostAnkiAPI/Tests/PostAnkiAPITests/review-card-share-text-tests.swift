import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Review card share text")
struct ReviewCardShareTextTests {
    private func card(kind: String, prompt: String, answer: String, background: String? = nil) -> ReviewCard {
        ReviewCard(
            variantId: "secret-id",
            knowledgeBitId: "kb",
            kind: kind,
            prompt: prompt,
            answer: answer,
            background: background,
            phase: "review",
            leech: false,
            intervalPreview: IntervalPreview(again: 1, hard: 2, good: 3, easy: 4)
        )
    }

    @Test("should share a plain card as question and answer without ids or notes")
    func plain() {
        let text = card(kind: "basic", prompt: "Capital of France?", answer: "Paris", background: "private note").shareText

        #expect(text == "Q: Capital of France?\nA: Paris")
    }

    @Test("should share a cloze card with the gap filled in the answer")
    func cloze() {
        let text = card(kind: "cloze", prompt: "____ runs on port ____", answer: "HTTPS / 443").shareText

        #expect(text == "Q: ____ runs on port ____\nA: HTTPS runs on port 443")
    }

    @Test("should drop the hint from the question and fill the blank for fill in the blank")
    func fillInTheBlankWithHint() {
        let text = card(kind: "fill_in_the_blank", prompt: "Budget, ____ (hint: who signs) and need.", answer: "authority").shareText

        #expect(text == "Q: Budget, ____ and need.\nA: Budget, authority and need.")
    }

    @Test("should fill the next list step into its sentence")
    func listNext() {
        let text = card(kind: "list_next", prompt: "SYN, SYN-ACK, ____", answer: "ACK").shareText

        #expect(text == "Q: SYN, SYN-ACK, ____\nA: SYN, SYN-ACK, ACK")
    }

    @Test("should keep the raw answer when the number of answers does not match the gaps")
    func mismatchedGaps() {
        let text = card(kind: "fill_in_the_blank", prompt: "A ____ B ____", answer: "x").shareText

        #expect(text == "Q: A ____ B ____\nA: x")
    }
}
