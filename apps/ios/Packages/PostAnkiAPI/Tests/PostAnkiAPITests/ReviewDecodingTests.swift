import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Review cards")
struct ReviewDecodingTests {
    @Test("should report due counts per review state from the cards response")
    func decodesCounts() throws {
        let response = try Fixture.decode(ReviewCardsResponse.self, "review-cards")

        #expect(response.counts.new == 7)
        #expect(response.counts.learning == 2)
        #expect(response.counts.review == 12)
        #expect(response.newRemainingToday == 13)
        #expect(response.nextDueAt == "2026-10-24T08:30:00.000Z")
    }

    @Test("should decode each card with its phase, leech flag and optional background")
    func decodesCards() throws {
        let response = try Fixture.decode(ReviewCardsResponse.self, "review-cards")

        #expect(response.cards.map(\.id) == ["var_01", "var_02"])
        #expect(response.cards[0].phase == "learning")
        #expect(response.cards[0].background == "Resilience patterns")
        #expect(response.cards[0].leech == false)
        #expect(response.cards[1].background == nil)
        #expect(response.cards[1].leech == true)
    }

    @Test("should decode interval previews for every grade in seconds")
    func decodesIntervalPreview() throws {
        let card = try #require(try Fixture.decode(ReviewCardsResponse.self, "review-cards").cards.first)

        #expect(card.intervalPreview.seconds(for: .again) == 60)
        #expect(card.intervalPreview.seconds(for: .hard) == 360)
        #expect(card.intervalPreview.seconds(for: .good) == 600)
        #expect(card.intervalPreview.seconds(for: .easy) == 345_600)
    }

    @Test("should decode an empty queue with no next due time")
    func decodesEmptyQueue() throws {
        let response = try Fixture.decode(ReviewCardsResponse.self, "review-cards-empty")

        #expect(response.cards.isEmpty)
        #expect(response.counts.review == 0)
        #expect(response.nextDueAt == nil)
    }

    @Test("should decode the recorded review with its next due date and fractional interval")
    func decodesRecordResult() throws {
        let result = try Fixture.decode(RecordReviewResult.self, "record-review-result")

        #expect(result.dueAt == "2026-10-27T09:00:00.000Z")
        #expect(result.intervalDays == 4.5)
        #expect(result.lapses == 1)
        #expect(result.suspended == false)
    }

    @Test("should encode a grade as its lowercase server value")
    func encodesGrade() throws {
        let input = RecordReviewInput(variantId: "var_01", grade: .good, durationMs: nil, requestId: nil)
        let json = try #require(String(data: JSONEncoder().encode(input), encoding: .utf8))

        #expect(json.contains("\"grade\":\"good\""))
    }
}
