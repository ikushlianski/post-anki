import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Pending review")
struct PendingReviewDecodingTests {
    @Test("should decode pending sources with their bits and variants")
    func decodesSources() throws {
        let sources = try Fixture.decode([PendingReviewSource].self, "pending-review")
        let source = try #require(sources.first)

        #expect(sources.count == 2)
        #expect(source.id == "src_01")
        #expect(source.subjectName == "System design")
        #expect(source.bits.count == 2)
        #expect(source.bits[0].variants.map(\.kind) == ["wh_question", "basic", "fill_in_the_blank"])
    }

    @Test("should decode a source with no text, subject or bits")
    func decodesBareSource() throws {
        let source = try #require(try Fixture.decode([PendingReviewSource].self, "pending-review").last)

        #expect(source.sourceText == nil)
        #expect(source.subjectName == nil)
        #expect(source.bits.isEmpty)
    }

    @Test("should decode a manual bit with no variants so it cannot be approved yet")
    func decodesManualBitWithoutVariants() throws {
        let bit = try #require(try Fixture.decode([PendingReviewSource].self, "pending-review").first?.bits.last)

        #expect(bit.origin == "manual")
        #expect(bit.background == "Added from the Mac app")
        #expect(bit.variants.isEmpty)
    }

    @Test("should label variant kinds with readable names")
    func labelsKinds() throws {
        let variants = try #require(try Fixture.decode([PendingReviewSource].self, "pending-review").first?.bits.first?.variants)

        #expect(variants.map(\.kindLabel) == ["Question", "Basic card", "Fill in the blank"])
    }

    @Test("should decode the pending count shown on the Review entry")
    func decodesCount() throws {
        #expect(try Fixture.decode(PendingReviewCountResponse.self, "pending-review-count").count == 5)
    }

    @Test("should summarise a bulk approval by skip reason")
    func summarisesBulkApproval() throws {
        let result = try Fixture.decode(PendingReviewBulkApprovalResult.self, "pending-review-bulk-approval")

        #expect(result.approved == ["kb_10", "kb_12"])
        #expect(result.summary() == "Approved 2. Skipped 4: 2 already decided, 2 have no questions yet.")
    }

    @Test("should map a 409 no_variant answer to a message that keeps the item")
    func mapsNoVariantConflict() {
        let outcome = PendingReviewDecision.approve.outcome(for: APIError.badStatus(409, "no_variant"))

        guard case .kept(let message) = outcome else {
            Issue.record("expected kept")
            return
        }

        #expect(message == "This item has no questions yet, so it can't be approved.")
    }

    @Test("should treat a 404 on approve as already removed elsewhere")
    func mapsNotFound() {
        let outcome = PendingReviewDecision.approve.outcome(for: APIError.badStatus(404, "not_found"))

        guard case .removedElsewhere = outcome else {
            Issue.record("expected removedElsewhere")
            return
        }
    }
}
