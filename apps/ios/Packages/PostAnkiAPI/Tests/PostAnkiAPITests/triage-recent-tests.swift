import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Triage recent decisions contract")
    struct TriageRecentTests {
        @Test("should ask for the last seven days with no search text and leave the mode out")
        func plainPath() {
            #expect(APIClient.triageRecentPath(q: "  ", mode: .both) == "/triage-decisions/recent?days=7")
        }

        @Test("should send the trimmed search text and chosen mode percent-encoded")
        func searchPath() {
            #expect(
                APIClient.triageRecentPath(q: " time to live ", mode: .meaning)
                    == "/triage-decisions/recent?days=7&q=time%20to%20live&mode=meaning"
            )
        }

        @Test("should decode decisions with the card text, reason options, models and match kind")
        func decodes() async throws {
            RecordingStub.install(body: Data(#"""
            {"days":7,"mode":"both","meaningUnavailable":false,"decisions":[
              {"id":"ctd_1","sessionId":"cts_1","bitId":"kb_1","verdict":"rejected","reasonCode":null,"note":null,
               "decidedAt":"2026-11-01T10:00:00.000Z","front":"What is TTL?","back":"Time to live","subjectType":"programming",
               "rejectReasonCodes":["too_trivial","other"],"extractionModelId":"m1","fusionModelIds":["a"],"score":1.4,"matchedBy":"both"},
              {"id":"ctd_2","verdict":"approved"}]}
            """#.utf8))

            let result = try await APIClient.recentTriageDecisions(q: "ttl")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(result.meaningUnavailable == false)
            #expect(result.decisions.first?.needsReason == true)
            #expect(result.decisions.first?.rejectReasonCodes == ["too_trivial", "other"])
            #expect(result.decisions.first?.matchedBy == "both")
            #expect(result.decisions.last?.needsReason == false)
        }

        @Test("should patch the decision with the chosen reason code")
        func setsReason() async throws {
            RecordingStub.install(body: try Fixture.data("triage-decision"))

            _ = try await APIClient.setTriageDecisionReason(decisionId: "ctd/1", reasonCode: "too_trivial", note: "too easy")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "PATCH")
            #expect(request.path == "/triage-decisions/ctd%2F1")
            #expect(request.body?["reasonCode"] as? String == "too_trivial")
            #expect(request.body?["note"] as? String == "too easy")
        }

        @Test("should send an explicit null to clear the reason")
        func clearsReason() async throws {
            RecordingStub.install(body: try Fixture.data("triage-decision"))

            _ = try await APIClient.setTriageDecisionReason(decisionId: "ctd_1", reasonCode: nil)

            #expect(RecordingStub.last?.body?["reasonCode"] is NSNull)
            #expect(RecordingStub.last?.body?["note"] == nil)
        }
    }
}
