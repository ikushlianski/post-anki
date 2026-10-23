import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Pending review triage undo")
struct PendingReviewTriageUndoTests {
    @Test("should post the dropped variant ids to the undo path of the piece")
    func buildsUndoRequest() throws {
        let request = try APIClient.makeRequest(
            "/knowledge-bits/\(APIClient.encodedSegment("kb/1"))/triage/undo",
            method: "POST",
            body: PendingReviewTriageUndoInput(restoreVariantIds: ["v2", "v3"])
        )
        let body = try #require(request.httpBody)
        let object = try #require(try JSONSerialization.jsonObject(with: body) as? [String: [String]])

        #expect(request.httpMethod == "POST")
        #expect(request.url?.path(percentEncoded: true) == "/knowledge-bits/kb%2F1/triage/undo")
        #expect(object["restoreVariantIds"] == ["v2", "v3"])
    }

    @Test("should read the dropped variant ids from a keep response and tolerate their absence")
    func decodesDroppedIds() throws {
        let with = try JSONDecoder().decode(
            PendingReviewTriageResponse.self,
            from: Data(#"{"ok":true,"droppedVariantIds":["v2","v3"]}"#.utf8)
        )
        let without = try JSONDecoder().decode(PendingReviewTriageResponse.self, from: Data(#"{"ok":true}"#.utf8))

        #expect(with.droppedVariantIds == ["v2", "v3"])
        #expect(without.droppedVariantIds.isEmpty)
    }

    @Test("should tell the reviewer a taken place blocks the undo and stop offering it")
    func mapsSlotTaken() {
        guard case .unavailable(let message) = PendingReviewTriageUndoOutcome.outcome(for: APIError.badStatus(409, "slot_taken")) else {
            Issue.record("expected unavailable")
            return
        }

        #expect(message.contains("newer question"))
    }

    @Test("should stop offering the undo when the piece changed or vanished")
    func mapsChanged() {
        for error in [APIError.badStatus(409, "blocked"), .badStatus(409, "variant_not_superseded"), .badStatus(404, "not_found")] {
            guard case .unavailable = PendingReviewTriageUndoOutcome.outcome(for: error) else {
                Issue.record("expected unavailable")
                return
            }
        }
    }

    @Test("should keep the undo available when the network is down or the server fails")
    func mapsRetryable() {
        for error in [URLError(.notConnectedToInternet) as Error, APIError.badStatus(500, nil)] {
            guard case .retryable = PendingReviewTriageUndoOutcome.outcome(for: error) else {
                Issue.record("expected retryable")
                return
            }
        }
    }
}
