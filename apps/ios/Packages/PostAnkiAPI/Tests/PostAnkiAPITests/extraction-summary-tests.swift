import Foundation
import Testing
@testable import PostAnkiAPI

private func decode(_ json: String) throws -> SourceRegenStatus {
    try JSONDecoder().decode(SourceRegenStatus.self, from: Data(json.utf8))
}

@Suite("Extraction summary line")
struct ExtractionSummaryTests {
    @Test("should show the plural card count when several cards were created")
    func plural() throws {
        let s = try decode(#"{"status":"done","failureReason":null,"outcome":"cards","cardCount":3}"#)

        #expect(s.summaryText == "3 cards created")
    }

    @Test("should show the singular line for exactly one card")
    func singular() throws {
        let s = try decode(#"{"status":"done","outcome":"cards","cardCount":1}"#)

        #expect(s.summaryText == "1 card created")
    }

    @Test("should say nothing was worth keeping when no cards came out")
    func nothing() throws {
        let s = try decode(#"{"status":"nothing_extracted","outcome":"nothing","cardCount":0}"#)

        #expect(s.summaryText == "Nothing worth keeping in this note")
    }

    @Test("should tell the user to retry and include the failure reason")
    func failed() throws {
        let s = try decode(#"{"status":"failed","failureReason":"model timed out","outcome":"failed","cardCount":0}"#)

        #expect(s.summaryText == "Extraction failed, retry. model timed out")
    }

    @Test("should omit the reason when a failure has none")
    func failedNoReason() throws {
        let s = try decode(#"{"status":"failed","failureReason":null,"outcome":"failed"}"#)

        #expect(s.summaryText == "Extraction failed, retry.")
    }

    @Test("should decode an old response without outcome and show no line")
    func legacy() throws {
        let s = try decode(#"{"status":"done","failureReason":null}"#)

        #expect(s.summaryText == nil)
        #expect(s.isFinished)
    }

    @Test("should treat a running response as unfinished")
    func running() throws {
        let s = try decode(#"{"status":"running","failureReason":null}"#)

        #expect(!s.isFinished)
        #expect(s.summaryText == nil)
    }
}

@Suite("Extraction summary stale-result guard")
struct ExtractionSummaryGuardTests {
    @Test("should apply a result for the note currently being tracked")
    func current() {
        #expect(ExtractionSummaryGuard.shouldApply(trackedSourceId: "b", resultSourceId: "b", isCancelled: false))
    }

    @Test("should drop a late result from an older note after a newer one was submitted")
    func stale() {
        #expect(!ExtractionSummaryGuard.shouldApply(trackedSourceId: "b", resultSourceId: "a", isCancelled: false))
    }

    @Test("should drop a result once polling was cancelled or stopped")
    func cancelled() {
        #expect(!ExtractionSummaryGuard.shouldApply(trackedSourceId: "a", resultSourceId: "a", isCancelled: true))
        #expect(!ExtractionSummaryGuard.shouldApply(trackedSourceId: nil, resultSourceId: "a", isCancelled: false))
    }
}
