import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Per-card schedules")
struct PerCardScheduleTests {
    @Test("should expose each queued cloze gap with its own card key and treat basic cards as note-level")
    func decodesCardKey() throws {
        let cards = try Fixture.decode(ReviewCardsResponse.self, "review-cards-per-card").cards

        #expect(cards[0].cardKey == "cloze:1")
        #expect(cards[0].isIndependentCard)
        #expect(cards[1].cardKey == "")
        #expect(cards[1].isIndependentCard == false)
    }

    @Test("should keep decoding queue cards from a server that sends no card key")
    func decodesOldQueue() throws {
        let cards = try Fixture.decode(ReviewCardsResponse.self, "review-cards").cards

        #expect(cards.allSatisfy { $0.cardKey == nil && !$0.isIndependentCard })
    }

    @Test("should read which sibling cards a grade buried so the queue can drop them")
    func decodesBuriedIds() throws {
        let result = try Fixture.decode(RecordReviewResult.self, "record-review-per-card")

        #expect(result.cardKey == "cloze:1")
        #expect(result.buriedVariantIds == ["var_c2", "var_c3"])
    }

    @Test("should tell an old server grade result (no buried list) from one that buried nothing")
    func oldGradeResult() throws {
        let old = try Fixture.decode(RecordReviewResult.self, "record-review-result")
        let none = try JSONDecoder().decode(
            RecordReviewResult.self,
            from: Data(#"{"reviewId":"r","knowledgeBitId":"k","phase":"review","dueAt":"x","intervalDays":1,"lapses":0,"leech":false,"suspended":false,"cardKey":"","buriedVariantIds":[]}"#.utf8)
        )

        #expect(old.buriedVariantIds == nil)
        #expect(none.buriedVariantIds == [])
    }

    @Test("should read the graded card and the siblings an undo released")
    func decodesUndo() throws {
        let result = try Fixture.decode(UndoReviewResult.self, "undo-review-per-card")
        let old = try JSONDecoder().decode(UndoReviewResult.self, from: Data(#"{"knowledgeBitId":"k"}"#.utf8))

        #expect(result.variantId == "var_c1")
        #expect(result.unburiedVariantIds == ["var_c2", "var_c3"])
        #expect(old.unburiedVariantIds == nil)
    }

    @Test("should send the time zone and only send burySiblings when it is switched off")
    func encodesGradeInput() throws {
        let scoped = RecordReviewInput(variantId: "v", grade: .good, durationMs: 5, requestId: "r", tz: "Europe/Minsk", burySiblings: false)
        let normal = RecordReviewInput(variantId: "v", grade: .good, durationMs: 5, requestId: "r", tz: "Europe/Minsk")
        let scopedJSON = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(scoped)) as? [String: Any])
        let normalJSON = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(normal)) as? [String: Any])

        #expect(scopedJSON["tz"] as? String == "Europe/Minsk")
        #expect(scopedJSON["burySiblings"] as? Bool == false)
        #expect(normalJSON["burySiblings"] == nil)
    }

    @Test("should list one suspended row per card and keep note-level rows from old servers")
    func decodesSuspendedCards() throws {
        let page = try Fixture.decode(SuspendedKnowledgePage.self, "suspended-per-card")

        #expect(page.items.map(\.id) == ["kb_10:var_c2", "kb_10:var_c3", "kb_11"])
        #expect(page.items[0].cardLabel == "Cloze c2")
        #expect(page.items[2].variantId == nil)
        #expect(page.items[2].cardLabel == nil)
    }

    @Test("should read the per-card state of a cloze note and nothing for a basic note")
    func decodesDetailCards() throws {
        let cloze = try Fixture.decode(KnowledgeDetail.self, "knowledge-detail-cards")
        let basic = try Fixture.decode(KnowledgeDetail.self, "knowledge-detail-legacy")

        #expect(cloze.perCardStates.map(\.cardKey) == ["cloze:1", "cloze:2", "cloze:3"])
        #expect(cloze.perCardStates[1].suspended)
        #expect(cloze.perCardStates[2].buried)
        #expect(basic.perCardStates.isEmpty)
    }

    @Test("should decode a card-scoped schedule result with its card key")
    func decodesControlResult() throws {
        let result = try Fixture.decode(ScheduleControlResult.self, "schedule-control-card")
        let old = try JSONDecoder().decode(
            ScheduleControlResult.self,
            from: Data(#"{"knowledgeBitId":"k","suspended":false,"buriedUntil":null,"leech":false}"#.utf8)
        )

        #expect(result.cardKey == "cloze:2")
        #expect(old.cardKey == nil)
    }
}

extension NetworkContracts {
    @Suite("Per-card schedule requests")
    struct PerCardRequestTests {
        @Test("should name the card when suspending one cloze gap and leave it out for the whole note")
        func controlBody() async throws {
            RecordingStub.install(body: Data(#"{"knowledgeBitId":"k","suspended":true,"buriedUntil":null,"leech":false,"cardKey":"cloze:2"}"#.utf8))

            _ = try await APIClient.setSchedule(id: "k", suspended: true, buried: nil, variantId: "var_c2")
            #expect(RecordingStub.last?.method == "PATCH")
            #expect(RecordingStub.last?.path == "/knowledge-bits/k/schedule")
            #expect(RecordingStub.last?.body?["variantId"] as? String == "var_c2")
            #expect(RecordingStub.last?.body?["tz"] as? String == TimeZone.current.identifier)

            _ = try await APIClient.setSchedule(id: "k", suspended: true, buried: nil)
            #expect(RecordingStub.last?.body?["variantId"] == nil)
        }

        @Test("should fetch the note detail from the note path")
        func detailPath() async throws {
            RecordingStub.install(body: Data(#"{"knowledgeBitId":"k"}"#.utf8))

            let detail = try await APIClient.knowledgeDetail(id: "k")

            #expect(RecordingStub.last?.method == "GET")
            #expect(RecordingStub.last?.path == "/knowledge-bits/k")
            #expect(detail.cards == nil)
        }
    }
}
