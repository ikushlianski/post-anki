import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Triage decision contract")
    struct TriageDecisionContractTests {
        @Test("should record a decision with verdict, note and dwell on the session decision path")
        func putsDecision() async throws {
            RecordingStub.install(body: try Fixture.data("triage-decision"))

            let record = try await APIClient.putTriageDecision(
                sessionId: "cts/02",
                bitId: "kb_1",
                verdict: .rejected,
                note: "odd blank",
                dwellMs: 2500
            )
            let request = try #require(RecordingStub.last)

            #expect(request.method == "PUT")
            #expect(request.path == "/triage-sessions/cts%2F02/decisions/kb_1")
            #expect(request.body?["verdict"] as? String == "rejected")
            #expect(request.body?["note"] as? String == "odd blank")
            #expect(request.body?["dwellMs"] as? Int == 2500)
            #expect(request.body?["reasonCode"] == nil)
            #expect(record.reasonCode == "bad_format")
            #expect(record.front == "What is TTL?")
        }

        @Test("should send an explicit null reason to clear it and leave the note out when unchanged")
        func clearsReason() async throws {
            RecordingStub.install(body: try Fixture.data("triage-decision"))

            _ = try await APIClient.putTriageDecision(sessionId: "cts_02", bitId: "kb_1", verdict: .rejected, reason: .clear)
            let body = try #require(RecordingStub.last?.body)

            #expect(body["reasonCode"] is NSNull)
            #expect(body["note"] == nil)
        }

        @Test("should send the chosen reject reason code")
        func setsReason() async throws {
            RecordingStub.install(body: try Fixture.data("triage-decision"))

            _ = try await APIClient.putTriageDecision(
                sessionId: "cts_02",
                bitId: "kb_1",
                verdict: .rejected,
                note: "",
                reason: .set(RejectReason.badFormat.rawValue)
            )
            let body = try #require(RecordingStub.last?.body)

            #expect(body["reasonCode"] as? String == "bad_format")
            #expect(body["note"] as? String == "")
        }

        @Test("should undo a decision with DELETE and no body")
        func undoesDecision() async throws {
            RecordingStub.install(body: try Fixture.data("triage-decision"))

            try await APIClient.undoTriageDecision(sessionId: "cts_02", bitId: "kb_1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "DELETE")
            #expect(request.path == "/triage-sessions/cts_02/decisions/kb_1")
            #expect(request.body == nil)
        }

        @Test("should surface a missing decision on undo as a 404 status error")
        func undoMissingFails() async throws {
            RecordingStub.install(status: 404, body: Data(#"{"error":"not_found"}"#.utf8))

            do {
                try await APIClient.undoTriageDecision(sessionId: "cts_02", bitId: "kb_9")
                Issue.record("expected failure")
            } catch APIError.badStatus(let status, _) {
                #expect(status == 404)
            }
        }

        @Test("should list the session decisions in server order")
        func listsDecisions() async throws {
            RecordingStub.install(body: Data(#"{"decisions":[{"id":"ctd_1","bitId":"a","verdict":"approved"},{"id":"ctd_2","bitId":"b","verdict":"rejected","front":"Q"}]}"#.utf8))

            let list = try await APIClient.listTriageDecisions(sessionId: "cts_02")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/triage-sessions/cts_02/decisions")
            #expect(list.map(\.bitId) == ["a", "b"])
            #expect(list.last?.front == "Q")
        }

        @Test("should decode a decision that only carries the required id")
        func decodesMinimalDecision() throws {
            let record = try JSONDecoder().decode(TriageDecisionRecord.self, from: Data(#"{"id":"ctd_1"}"#.utf8))

            #expect(record.id == "ctd_1")
            #expect(record.note == nil)
            #expect(record.undoneAt == nil)
        }

        @Test("should record a discard with the undecided count")
        func discardsSession() async throws {
            RecordingStub.install(body: try Fixture.data("triage-session-v2"))

            let session = try await APIClient.discardTriageSession(id: "cts_02", undecidedCount: 7)
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/triage-sessions/cts_02/discards")
            #expect(request.body?["undecidedCount"] as? Int == 7)
            #expect(session.status == "discarded")
            #expect(session.endedBy == "discarded")
        }

        @Test("should send the finish undecided count and per-decision notes")
        func finishCarriesNotes() async throws {
            RecordingStub.install(body: try Fixture.data("triage-session-finished"))

            _ = try await APIClient.finishTriageSession(
                id: "cts_02",
                feedbackText: "",
                decisions: [TriageDecision(bitId: "kb_1", verdict: .rejected, note: "odd", reasonCode: "bad_format", dwellMs: 900)],
                undecidedCount: 3
            )
            let body = try #require(RecordingStub.last?.body)
            let sent = try #require(body["decisions"] as? [[String: Any]])

            #expect(body["undecidedCount"] as? Int == 3)
            #expect(sent.first?["note"] as? String == "odd")
            #expect(sent.first?["reasonCode"] as? String == "bad_format")
            #expect(sent.first?["dwellMs"] as? Int == 900)
        }

        @Test("should decode the new session fields and ignore unknown ones")
        func decodesNewSessionFields() throws {
            let session = try Fixture.decode(TriageSessionResponse.self, "triage-session-v2")

            #expect(session.client == "ios")
            #expect(session.undecidedCount == 7)
            #expect(session.lastActivityAt == "2026-10-25T09:03:00.000Z")
        }

        @Test("should decode an old session response without the new fields")
        func decodesOldSession() throws {
            let session = try Fixture.decode(TriageSessionResponse.self, "triage-session")

            #expect(session.client == nil)
            #expect(session.endedBy == nil)
            #expect(session.undecidedCount == nil)
        }
    }
}
