import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("AI suggestion decoding")
struct AiSuggestionDecodingTests {
    @Test("should carry the AI suggestion on a pending bit that has one and none on a bit without")
    func pendingBit() throws {
        let bits = try #require(try Fixture.decode([PendingReviewSource].self, "pending-review").first?.bits)

        #expect(bits[0].aiSuggestion == "An idempotency key lets a client retry a payment safely.")
        #expect(bits[1].aiSuggestion == nil)
    }

    @Test("should keep the AI suggestion when a pending bit gets an example")
    func suggestionSurvivesExample() throws {
        let bit = try #require(try Fixture.decode([PendingReviewSource].self, "pending-review").first?.bits.first)

        #expect(bit.withExample("Example", aiGeneratedAt: "2026-10-22T18:00:00.000Z").aiSuggestion == bit.aiSuggestion)
    }

    @Test("should carry the AI suggestion and the user's original phrase on a review card")
    func reviewCard() throws {
        let cards = try Fixture.decode(ReviewCardsResponse.self, "review-cards").cards

        #expect(cards[0].aiSuggestion == "circuit breaker")
        #expect(cards[0].originalPhrase == "circut breker")
        #expect(cards[1].aiSuggestion == nil)
        #expect(cards[1].originalPhrase == nil)
    }
}
