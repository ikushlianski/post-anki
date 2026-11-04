import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Triage inbox and AI example")
struct InboxDecodingTests {
    @Test("should decode an inbox list with a null subject name and a null example")
    func decodesInboxList() throws {
        let list = try Fixture.decode(InboxKnowledgeBitList.self, "inbox-list")

        #expect(list.count == 2)
        #expect(list.items[0].subjectName == "Concurrency")
        #expect(list.items[0].exampleAiGeneratedAt != nil)
        #expect(list.items[1].subjectName == nil)
        #expect(list.items[1].background == nil)
        #expect(list.items[1].cardCount == 0)
    }

    @Test("should decode the editable note of a cloze item and leave other items without one")
    func decodesInboxNote() throws {
        let list = try Fixture.decode(InboxKnowledgeBitList.self, "inbox-list")

        #expect(list.items[0].note?.variantId == "kbqv_1")
        #expect(list.items[0].note?.kind == .cloze)
        #expect(list.items[0].note?.text.contains("{{c1::mutex}}") == true)
        #expect(list.items[1].note == nil)
        #expect(list.items[0].withExample("x", aiGeneratedAt: nil).note == list.items[0].note)
    }

    @Test("should treat a list note as the list editor kind")
    func listNoteKind() {
        #expect(InboxNoteSource(variantId: "v", mode: "list", text: "T\na\nb\nc").kind == .list)
    }

    @Test("should decode the example result with the previous example and the generations left")
    func decodesExampleResult() throws {
        let result = try Fixture.decode(GenerateKnowledgeBitExampleResult.self, "example-result")

        #expect(result.generationsLeft == 4)
        #expect(result.previousExample == nil)
        #expect(result.example.hasPrefix("Two threads"))
    }

    @Test("should decode the move result with the new inbox count")
    func decodesMoveResult() throws {
        let result = try JSONDecoder().decode(MoveToInboxResult.self, from: Data(#"{"ok":true,"inboxCount":3}"#.utf8))

        #expect(result.inboxCount == 3)
    }

    @Test("should decode the pending count with and without the inbox count")
    func decodesCounts() throws {
        let withInbox = try Fixture.decode(PendingReviewCountResponse.self, "pending-review-count-inbox")
        let old = try Fixture.decode(PendingReviewCountResponse.self, "pending-review-count")

        #expect(withInbox.inboxCount == 2)
        #expect(withInbox.count == 3)
        #expect(old.inboxCount == 0)
    }

    @Test("should decode a pending bit with and without the AI example marker")
    func decodesPendingBitMarker() throws {
        let json = #"{"id":"a","body":"b","background":"ex","exampleAiGeneratedAt":"2026-10-28T09:00:00.000Z","origin":"extracted","variants":[]}"#
        let plain = #"{"id":"a","body":"b","background":"ex","origin":"extracted","variants":[]}"#
        let marked = try JSONDecoder().decode(PendingReviewBit.self, from: Data(json.utf8))
        let human = try JSONDecoder().decode(PendingReviewBit.self, from: Data(plain.utf8))

        #expect(marked.hasAiExample)
        #expect(!marked.hasHumanExample)
        #expect(human.hasHumanExample)
        #expect(!human.hasAiExample)
    }
}

@Suite("Triage inbox messages")
struct InboxMessageTests {
    @Test("should ask for confirmation when a human example exists")
    func mapsExampleExists() {
        #expect(KnowledgeBitExampleOutcome.outcome(for: APIError.badStatus(409, "example_exists")) == .needsOverwriteConfirmation)
    }

    @Test("should explain the limit of 5, the paused budget and a generic failure in plain words")
    func mapsExampleErrors() {
        #expect(
            KnowledgeBitExampleOutcome.outcome(for: APIError.badStatus(409, "limit_reached"))
                == .message("You used all 5 AI examples for this item.")
        )
        #expect(
            KnowledgeBitExampleOutcome.outcome(for: APIError.badStatus(503, "budget_exceeded"))
                == .message("AI is paused for today because the daily budget is used up. Try again tomorrow.")
        )
        #expect(
            KnowledgeBitExampleOutcome.outcome(for: APIError.badStatus(502, "generation_failed"))
                == .message("Couldn't write an example. Try again.")
        )
    }

    @Test("should tell the learner a connection is needed when the network is down")
    func mapsOffline() {
        let offline = URLError(.notConnectedToInternet)

        #expect(KnowledgeBitExampleOutcome.outcome(for: offline) == .message(InboxMessages.offline))
        #expect(InboxMoveOutcome.outcome(for: offline) == .kept(message: InboxMessages.offline))
        #expect(InboxMessages.offline.contains("internet connection"))
    }

    @Test("should treat a cancelled request as silent")
    func mapsCancelled() {
        #expect(KnowledgeBitExampleOutcome.outcome(for: URLError(.cancelled)) == .cancelled)
    }

    @Test("should remove the card when the item was decided elsewhere")
    func mapsMoveConflict() {
        #expect(InboxMoveOutcome.outcome(for: APIError.badStatus(409, "blocked")) == .removedElsewhere)
        #expect(InboxMoveOutcome.outcome(for: APIError.badStatus(404, "not_found")) == .removedElsewhere)
        #expect(InboxMoveOutcome.outcome(for: APIError.badStatus(500, nil)) == .kept(message: "Couldn't send this to the Inbox. Try again."))
    }

    @Test("should keep stable accessibility identifiers for the new controls")
    func accessibilityIdentifiers() {
        #expect(TriageAccessibilityID.inboxButton == "triage.inbox")
        #expect(TriageAccessibilityID.exampleButton == "triage.example")
        #expect(TriageAccessibilityID.inboxRow("kb_1") == "inbox.row.kb_1")
        #expect(TriageActionName.inbox == "Chat about this")
        #expect(TriageActionName.example == "AI example")
    }
}

extension NetworkContracts {
    @Suite("Inbox requests")
    struct InboxRequestTests {
        @Test("should move to the inbox with POST and return with DELETE on the same path")
        func movesAndReturns() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"inboxCount":4}"#.utf8))

            let count = try await APIClient.moveKnowledgeBitToInbox(id: "kb 1/x")

            #expect(count == 4)
            #expect(RecordingStub.last?.method == "POST")
            #expect(RecordingStub.last?.path == "/knowledge-bits/kb%201%2Fx/inbox")

            RecordingStub.install(body: Data(#"{"ok":true}"#.utf8))
            try await APIClient.returnKnowledgeBitFromInbox(id: "kb 1/x")

            #expect(RecordingStub.last?.method == "DELETE")
            #expect(RecordingStub.last?.path == "/knowledge-bits/kb%201%2Fx/inbox")
        }

        @Test("should discard with POST to the discard path and list from the inbox path")
        func discardsAndLists() async throws {
            RecordingStub.install(body: Data(#"{"ok":true}"#.utf8))
            try await APIClient.discardKnowledgeBitFromInbox(id: "a/b")

            #expect(RecordingStub.last?.path == "/knowledge-bits/a%2Fb/inbox/discard")

            RecordingStub.install(body: try Fixture.data("inbox-list"))
            let list = try await APIClient.listInboxKnowledgeBits()

            #expect(RecordingStub.last?.path == "/knowledge-bits/inbox")
            #expect(list.items.count == 2)
        }

        @Test("should send an empty body for the first example and overwrite true when confirmed")
        func exampleBodies() async throws {
            RecordingStub.install(body: try Fixture.data("example-result"))
            _ = try await APIClient.generateKnowledgeBitExample(id: "kb_1")

            #expect(RecordingStub.last?.path == "/knowledge-bits/kb_1/example")
            #expect(RecordingStub.last?.method == "POST")
            #expect(RecordingStub.last?.body?["overwrite"] == nil)

            _ = try await APIClient.generateKnowledgeBitExample(id: "kb_1", overwrite: true)

            #expect(RecordingStub.last?.body?["overwrite"] as? Bool == true)
        }
    }
}
