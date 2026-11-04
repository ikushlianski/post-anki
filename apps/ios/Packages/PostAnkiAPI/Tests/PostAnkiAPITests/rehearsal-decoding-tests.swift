import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Rehearsal follow-up")
struct RehearsalDecodingTests {
    private static let base = #""reviewId":"r1","knowledgeBitId":"kb_1","phase":"review","dueAt":"2026-11-10T09:00:00.000Z","intervalDays":6,"lapses":0,"leech":false,"suspended":false"#
    private static let follow = #""followUp":{"variantId":"v2","knowledgeBitId":"kb_1","kind":"wh_question","prompt":"p","answer":"a","background":null,"phase":"review","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}"#

    private func decode(_ body: String) throws -> RecordReviewResult {
        try JSONDecoder().decode(RecordReviewResult.self, from: Data("{\(body)}".utf8))
    }

    @Test("should read the other wording the server offers after a grade")
    func decodesFollowUp() throws {
        let result = try decode("\(Self.base),\(Self.follow)")

        #expect(result.followUp?.variantId == "v2")
        #expect(result.followUp?.isRehearsal == false)
    }

    @Test("should still read a result from an older server without a follow-up")
    func decodesWithoutFollowUp() throws {
        #expect(try decode(Self.base).followUp == nil)
        #expect(try decode("\(Self.base),\"followUp\":null").followUp == nil)
    }

    @Test("should mark a card as a rehearsal without changing which card it is")
    func marksRehearsal() throws {
        let card = try #require(try decode("\(Self.base),\(Self.follow)").followUp)

        #expect(card.asRehearsal.isRehearsal)
        #expect(card.asRehearsal.variantId == card.variantId)
    }

    @Test("should send the rehearsal flag only when set")
    func encodesRehearsalFlag() throws {
        let plain = try JSONSerialization.jsonObject(with: JSONEncoder().encode(RecordReviewInput(variantId: "v", grade: .good, durationMs: 1, requestId: "q"))) as? [String: Any]
        let rehearsal = try JSONSerialization.jsonObject(with: JSONEncoder().encode(RecordReviewInput(variantId: "v", grade: .good, durationMs: 1, requestId: "q", rehearsal: true))) as? [String: Any]

        #expect(plain?["rehearsal"] == nil)
        #expect(rehearsal?["rehearsal"] as? Bool == true)
    }
}
