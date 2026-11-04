import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Reject reasons and nothing extracted")
struct RejectReasonAndNothingExtractedTests {
    @Test("should offer exactly the 7 selectable reasons in the picker")
    func selectableList() {
        #expect(RejectReason.selectable.map(\.rawValue) == [
            "question_bent_to_answer", "restates_source_no_value", "text_recall_only",
            "wrong_or_unsupported_answer", "wrong_language", "duplicate_or_overlap", "other"
        ])
    }

    @Test("should still read and label the four legacy codes from old decisions")
    func legacyCodes() {
        for code in ["too_vague_or_no_context", "meta_wording", "not_a_fact_or_trivial", "bad_format"] {
            let reason = RejectReason(rawValue: code)

            #expect(reason != nil)
            #expect(reason?.isSelectable == false)
            #expect(RejectReason.label(forCode: code) != RejectReason.unknownLabel)
        }

        #expect(RejectReason.selectable.count + RejectReason.legacy.count + RejectReason.subjectSpecific.count == RejectReason.allCases.count)
    }

    @Test("should label a code from a newer server with a neutral fallback and no code as nil")
    func unknownCode() {
        #expect(RejectReason.label(forCode: "something_new") == RejectReason.unknownLabel)
        #expect(RejectReason.label(forCode: nil) == nil)
    }

    @Test("should show only the card's own reasons, labelled, with unknown codes humanized")
    func optionsForCodes() {
        let options = RejectReasonOption.options(forCodes: ["too_trivial", "front_unclear_target_phrase", "brand_new_code", "too_trivial"])

        #expect(options.map(\.code) == ["too_trivial", "front_unclear_target_phrase", "brand_new_code"])
        #expect(options[0].label == "Too trivial")
        #expect(options[1].label == "Front doesn't make clear which phrase the answer should be")
        #expect(options[2].label == "Brand new code")
        #expect(RejectReasonOption.options(forCodes: nil).map(\.code) == RejectReason.selectable.map(\.rawValue))
        #expect(RejectReasonOption.options(forCodes: []).count == 7)
    }

    @Test("should read reject reason codes on pending groups and chat items, and tolerate their absence")
    func decodesCodes() throws {
        let source = try JSONDecoder().decode(PendingReviewSource.self, from: Data(#"{"knowledgeSourceId":"s","sourceText":null,"subjectName":null,"bits":[],"rejectReasonCodes":["no_code_context","other"]}"#.utf8))
        let bare = try JSONDecoder().decode(PendingReviewSource.self, from: Data(#"{"knowledgeSourceId":"s","sourceText":null,"subjectName":null,"bits":[]}"#.utf8))
        let item = try JSONDecoder().decode(ChatQueueItem.self, from: Data(#"{"id":"1","body":"b","origin":"extracted","chatAt":"2026-01-01T00:00:00Z","turnsLeft":3,"rejectReasonCodes":["outdated_api"]}"#.utf8))

        #expect(source.rejectReasonCodes == ["no_code_context", "other"])
        #expect(bare.rejectReasonCodes == nil)
        #expect(item.rejectReasonCodes == ["outdated_api"])
    }

    @Test("should decode a decision whose reason code is unknown to this app")
    func decodesUnknownReasonDecision() throws {
        let json = Data(#"{"id":"d1","verdict":"rejected","reasonCode":"from_the_future"}"#.utf8)
        let record = try JSONDecoder().decode(TriageDecisionRecord.self, from: json)

        #expect(record.reasonCode == "from_the_future")
        #expect(RejectReason(rawValue: "from_the_future") == nil)
    }

    @Test("should show the nothing-extracted wording and keep it informational")
    func nothingExtracted() throws {
        let sources = try Fixture.decode([PendingReviewSource].self, "pending-review-nothing-extracted")
        let attention = try #require(sources[0].attention)

        #expect(attention.kind == .nothingExtracted)
        #expect(attention.isNothingExtracted)
        #expect(attention.isInformational)
        #expect(attention.wording == "Nothing here looked worth turning into a card.")
    }

    @Test("should fall back to the generic failure for an attention kind it does not know")
    func unknownKind() throws {
        let sources = try Fixture.decode([PendingReviewSource].self, "pending-review-nothing-extracted")

        #expect(sources[1].attention?.kind == .failed)
    }
}
