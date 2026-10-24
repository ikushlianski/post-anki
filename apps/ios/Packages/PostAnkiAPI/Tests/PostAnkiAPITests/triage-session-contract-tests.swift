import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Triage session contract")
    struct TriageSessionContractTests {
        @Test("should start a session for a subject with POST /triage-sessions")
        func startsSessionWithSubject() async throws {
            RecordingStub.install(body: try Fixture.data("triage-session"))

            let session = try await APIClient.startTriageSession(subjectId: "subj_01")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/triage-sessions")
            #expect(request.body?["subjectId"] as? String == "subj_01")
            #expect(session.id == "ts_01")
            #expect(session.status == "open")
        }

        @Test("should start a session without a subject by sending no subject")
        func startsSessionWithoutSubject() async throws {
            RecordingStub.install(body: try Fixture.data("triage-session"))

            _ = try await APIClient.startTriageSession(subjectId: nil)
            let request = try #require(RecordingStub.last)

            #expect(request.body?["subjectId"] == nil)
        }

        @Test("should finish a session with the feedback text and every decision")
        func finishesSession() async throws {
            RecordingStub.install(body: try Fixture.data("triage-session-finished"))

            let result = try await APIClient.finishTriageSession(
                id: "ts/01",
                feedbackText: "Too many blanks.",
                decisions: [
                    TriageDecision(bitId: "kb_1", verdict: .approved),
                    TriageDecision(bitId: "kb_2", verdict: .rejected)
                ]
            )
            let request = try #require(RecordingStub.last)
            let decisions = try #require(request.body?["decisions"] as? [[String: String]])

            #expect(request.method == "POST")
            #expect(request.path == "/triage-sessions/ts%2F01/finish")
            #expect(request.body?["feedbackText"] as? String == "Too many blanks.")
            #expect(decisions == [["bitId": "kb_1", "verdict": "approved"], ["bitId": "kb_2", "verdict": "rejected"]])
            #expect(result.acceptedCount == 5)
        }

        @Test("should send an empty feedback text and no decisions when nothing was typed or decided")
        func finishesEmptySession() async throws {
            RecordingStub.install(body: try Fixture.data("triage-session-finished"))

            _ = try await APIClient.finishTriageSession(id: "ts_01", feedbackText: "", decisions: [])
            let request = try #require(RecordingStub.last)

            #expect(request.body?["feedbackText"] as? String == "")
            #expect((request.body?["decisions"] as? [Any])?.isEmpty == true)
        }

        @Test("should grade an approved card with rating, note and the grades path")
        func gradesWithNote() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"feedbackId":"fb_1"}"#.utf8))

            let feedbackId = try await APIClient.gradeKnowledgeBit(id: "kb/1", rating: 3, note: "Clear")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb%2F1/grades")
            #expect(request.body?["rating"] as? Int == 3)
            #expect(request.body?["note"] as? String == "Clear")
            #expect(feedbackId == "fb_1")
        }

        @Test("should leave the note out of a grade when there is none")
        func gradesWithoutNote() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"feedbackId":"fb_1"}"#.utf8))

            _ = try await APIClient.gradeKnowledgeBit(id: "kb_1", rating: 3, note: nil)

            #expect(RecordingStub.last?.body?["note"] == nil)
        }

        @Test("should patch only the note on a reject feedback")
        func patchesFeedbackNote() async throws {
            RecordingStub.install()

            try await APIClient.updateKnowledgeBitFeedbackNote(id: "fb/1", note: "Too vague")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "PATCH")
            #expect(request.path == "/knowledge-bit-feedback/fb%2F1")
            #expect(request.body?.keys.sorted() == ["note"])
            #expect(request.body?["note"] as? String == "Too vague")
        }

        @Test("should surface a stale session as a 404 status error")
        func finishOfUnknownSessionFails() async throws {
            RecordingStub.install(status: 404, body: Data(#"{"error":"not_found"}"#.utf8))

            do {
                _ = try await APIClient.finishTriageSession(id: "gone", feedbackText: "", decisions: [])
                Issue.record("expected failure")
            } catch APIError.badStatus(let status, let code) {
                #expect(status == 404)
                #expect(code == "not_found")
            }
        }

        @Test("should decode the finished session counts and style notes")
        func decodesFinishedSession() throws {
            let session = try Fixture.decode(TriageSessionResponse.self, "triage-session-finished")

            #expect(session.status == "distilled")
            #expect(session.acceptedCount == 5)
            #expect(session.rejectedCount == 2)
            #expect(session.feedbackText == "Too many fill-in-the-blank cards.")
            #expect(session.notes.map(\.text) == ["Prefer one-sentence answers.", "Avoid fill-in-the-blank for definitions."])
            #expect(session.notes.map(\.enabled) == [true, false])
            #expect(session.notes.first?.subjectId == nil)
        }

        @Test("should decode an open session with no notes")
        func decodesOpenSession() throws {
            let session = try Fixture.decode(TriageSessionResponse.self, "triage-session")

            #expect(session.endedAt == nil)
            #expect(session.subjectId == "subj_01")
            #expect(session.notes.isEmpty)
        }
    }
}
