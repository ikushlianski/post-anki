import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Cloze and ordered-list cards")
struct ClozeListCardTests {
    @Test("should decode review cards of the cloze and list kinds without failing")
    func decodesReviewCards() throws {
        let response = try Fixture.decode(ReviewCardsResponse.self, "review-cards-cloze-list")

        #expect(response.cards.map(\.kind) == ["cloze", "list_step", "list_next", "list_overview"])
        #expect(response.cards[3].answer.hasPrefix("3 steps\n1. SYN"))
    }

    @Test("should hide the active gap in a cloze prompt and keep the hint readable")
    func hidesClozeGap() throws {
        let card = try #require(try Fixture.decode(ReviewCardsResponse.self, "review-cards-cloze-list").cards.first)

        #expect(CardKind.displayPrompt(kind: card.kind, prompt: card.prompt) == "[...] (hint: protocol) runs over port 443 and encrypts web traffic.")
        #expect(card.answer == "HTTPS")
    }

    @Test("should blank the next-step card but leave other list cards untouched")
    func listPrompts() throws {
        let cards = try Fixture.decode(ReviewCardsResponse.self, "review-cards-cloze-list").cards

        #expect(CardKind.displayPrompt(kind: cards[2].kind, prompt: cards[2].prompt) == "TCP handshake: after \"SYN\" the next step is [...]")
        #expect(CardKind.displayPrompt(kind: cards[1].kind, prompt: cards[1].prompt) == cards[1].prompt)
        #expect(CardKind.displayPrompt(kind: cards[3].kind, prompt: cards[3].prompt) == cards[3].prompt)
    }

    @Test("should decode pending bits with cloze and list variants and label them readably")
    func decodesPendingVariants() throws {
        let bits = try #require(try Fixture.decode([PendingReviewSource].self, "pending-review-cloze-list").first?.bits)

        #expect(bits[0].variants.map(\.kindLabel) == ["Cloze", "Cloze"])
        #expect(bits[1].variants.map(\.kindLabel) == ["List step", "Next step", "List overview"])
        #expect(bits[0].variants[1].displayPrompt == "HTTPS runs over port 443 and [...] secures it.")
    }

    @Test("should show unknown future kinds as given instead of failing")
    func unknownKind() {
        #expect(CardKind.label("future_kind") == "future_kind")
        #expect(CardKind.isBlank("future_kind") == false)
    }

    @Test("should blank raw gaps in list rows that carry no kind")
    func hidesBlanksInRows() {
        #expect(CardKind.hideBlanks("a ____ b") == "a [...] b")
    }
}
