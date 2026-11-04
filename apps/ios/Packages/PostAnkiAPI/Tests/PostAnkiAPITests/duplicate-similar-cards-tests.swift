import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Duplicate similar cards")
struct DuplicateSimilarCardsTests {
    private struct Down: Error {}

    private func duplicate(_ ids: [String]) -> PendingReviewDuplicateOf {
        PendingReviewDuplicateOf(bitId: "p", front: "Carried front", back: "Carried back", similarity: 0.9, similarBitIds: ids)
    }

    private func detail(_ id: String) throws -> SimilarCardDetail {
        let json = #"{"knowledgeBitId":"\#(id)","body":"body \#(id)","phrasings":[{"prompt":"Q \#(id)","answer":"A \#(id)"}]}"#

        return try JSONDecoder().decode(SimilarCardDetail.self, from: Data(json.utf8))
    }

    @Test("should ask for the main card and each other similar card once, at most five")
    func capsAndDeduplicates() {
        let ids = DuplicateSimilarCards.ids(for: duplicate(["p", "a", "a", "b", "c", "d", "e"]))

        #expect(ids == ["p", "a", "b", "c", "d"])
    }

    @Test("should list every similar card in order with the front and back from its own detail")
    func listsAll() async throws {
        let result = await DuplicateSimilarCards.load(for: duplicate(["p", "a", "b"])) { try self.detail($0) }

        #expect(result.cards.map(\.bitId) == ["p", "a", "b"])
        #expect(result.cards[1].front == "Q a")
        #expect(result.cards[1].back == "A a")
        #expect(result.failedCount == 0)
    }

    @Test("should keep the main card from its carried text and count the others that failed to load")
    func fallsBackOnFailure() async {
        let result = await DuplicateSimilarCards.load(for: duplicate(["p", "a", "b"])) { id in
            if id == "a" || id == "p" { throw Down() }

            return try self.detail(id)
        }

        #expect(result.cards.map(\.bitId) == ["p", "b"])
        #expect(result.cards[0].front == "Carried front")
        #expect(result.failedCount == 1)
    }

    @Test("should fall back to the body when a card has no phrasings")
    func bodyWhenNoPhrasings() throws {
        let json = #"{"knowledgeBitId":"z","body":"Just a body","phrasings":[]}"#
        let card = try JSONDecoder().decode(SimilarCardDetail.self, from: Data(json.utf8)).card

        #expect(card.front == "Just a body")
        #expect(card.back == nil)
    }
}
