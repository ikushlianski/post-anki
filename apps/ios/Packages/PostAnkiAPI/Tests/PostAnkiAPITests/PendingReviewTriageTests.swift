import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Pending review triage")
struct PendingReviewTriageTests {
    @Test("should post the kept variant ids to the triage path of the piece")
    func buildsTriageRequest() throws {
        let request = try APIClient.makeRequest(
            "/knowledge-bits/\(APIClient.encodedSegment("kb/1"))/triage",
            method: "POST",
            body: PendingReviewTriageInput(keepVariantIds: ["v1", "v2"])
        )
        let body = try #require(request.httpBody)
        let object = try #require(try JSONSerialization.jsonObject(with: body) as? [String: [String]])

        #expect(request.httpMethod == "POST")
        #expect(request.url?.path(percentEncoded: true) == "/knowledge-bits/kb%2F1/triage")
        #expect(object["keepVariantIds"] == ["v1", "v2"])
    }

    @Test("should keep the piece and explain when a chosen variant is no longer active")
    func mapsVariantNotActive() {
        let outcome = PendingReviewTriageOutcome.outcome(for: APIError.badStatus(409, "variant_not_active"))

        guard case .kept(let message) = outcome else { Issue.record("expected kept"); return }

        #expect(message.contains("changed"))
    }

    @Test("should keep the piece on invalid input and on no_variant")
    func mapsRejectedInput() {
        for error in [APIError.badStatus(400, "invalid_input"), APIError.badStatus(409, "no_variant")] {
            guard case .kept = PendingReviewTriageOutcome.outcome(for: error) else { Issue.record("expected kept"); return }
        }
    }

    @Test("should drop the piece from the queue when it was decided elsewhere")
    func mapsBlockedAndMissing() {
        #expect(PendingReviewTriageOutcome.outcome(for: APIError.badStatus(409, "blocked")) == .removedElsewhere)
        #expect(PendingReviewTriageOutcome.outcome(for: APIError.badStatus(404, "not_found")) == .removedElsewhere)
    }

    @Test("should keep the piece with an offline message when the network is down")
    func mapsOffline() {
        guard case .kept(let message) = PendingReviewTriageOutcome.outcome(for: URLError(.notConnectedToInternet)) else {
            Issue.record("expected kept")
            return
        }

        #expect(message.contains("connect"))
    }
}
