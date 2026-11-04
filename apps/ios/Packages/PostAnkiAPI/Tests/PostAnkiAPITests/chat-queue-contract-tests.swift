import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Chat queue contract")
    struct ChatQueueContractTests {
        @Test("should list the cards waiting in Chat with their turns left and the badge count")
        func listsQueue() async throws {
            RecordingStub.install(body: try Fixture.data("chat-queue-list"))

            let list = try await APIClient.listChatQueue()
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/knowledge-bits/chat-queue")
            #expect(list.count == 2)
            #expect(list.items[0].turnsLeft == 6)
            #expect(list.items[1].background == nil)
        }

        @Test("should read snoozedUntil with or without fractional seconds and as nothing when null or garbled")
        func decodesSnoozedUntil() throws {
            func item(_ value: String) throws -> ChatQueueItem {
                let json = Data(#"{"id":"a","body":"b","background":null,"origin":"manual","subjectName":null,"chatAt":"t","turnsLeft":1,"snoozedUntil":\#(value)}"#.utf8)

                return try JSONDecoder().decode(ChatQueueItem.self, from: json)
            }

            #expect(try item(#""2099-01-02T03:04:05.123Z""#).snoozedUntil != nil)
            #expect(try item(#""2099-01-02T03:04:05Z""#).snoozedUntil != nil)
            #expect(try item("null").snoozedUntil == nil)
            #expect(try item(#""nope""#).snoozedUntil == nil)
            #expect(try item(#""2099-01-02T03:04:05Z""#).isSnoozed())
            #expect(try item(#""2000-01-02T03:04:05Z""#).isSnoozed() == false)
        }

        @Test("should show the source title and link only for http and https source URLs")
        func decodesSource() throws {
            func item(_ extra: String) throws -> ChatQueueItem {
                let json = Data(#"{"id":"a","body":"b","origin":"manual","chatAt":"t","turnsLeft":1\#(extra)}"#.utf8)

                return try JSONDecoder().decode(ChatQueueItem.self, from: json)
            }

            let web = try item(#","sourceTitle":"Notes","sourceUrl":"https://example.com/a""#)
            #expect(web.sourceTitle == "Notes")
            #expect(web.sourceLink?.absoluteString == "https://example.com/a")
            #expect(try item(#","sourceTitle":"N","sourceUrl":"http://example.com""#).sourceLink != nil)

            let script = try item(#","sourceTitle":"Notes","sourceUrl":"javascript:alert(1)""#)
            #expect(script.sourceTitle == "Notes")
            #expect(script.sourceLink == nil)
            #expect(try item(#","sourceTitle":"N","sourceUrl":"file:///etc/passwd""#).sourceLink == nil)
            #expect(try item(#","sourceTitle":"N","sourceUrl":"not a url""#).sourceLink == nil)

            let none = try item("")
            #expect(none.sourceTitle == nil && none.sourceUrl == nil && none.sourceLink == nil)
            #expect(try item(#","sourceTitle":null,"sourceUrl":null"#).sourceTitle == nil)
        }

        @Test("should snooze a card for N days and return when it wakes")
        func snoozes() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"snoozedUntil":"2099-01-02T03:04:05.000Z"}"#.utf8))

            let until = try await APIClient.snoozeChatQueue(id: "kb/1", days: 7)
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb%2F1/chat-queue/snooze")
            #expect(request.body?["days"] as? Int == 7)
            #expect(until != nil)
        }

        @Test("should clear a snooze with DELETE")
        func unsnoozes() async throws {
            RecordingStub.install()

            try await APIClient.unsnoozeChatQueue(id: "kb_1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "DELETE")
            #expect(request.path == "/knowledge-bits/kb_1/chat-queue/snooze")
        }

        @Test("should map a snooze on a card that left Chat to not-in-chat")
        func snoozeBlocked() async throws {
            RecordingStub.install(status: 409, body: Data(#"{"error":"not_in_chat"}"#.utf8))

            do {
                try await APIClient.snoozeChatQueue(id: "kb_1", days: 1)
                Issue.record("expected a failure")
            } catch {
                #expect(ChatQueueFailure.failure(for: error) == .notInChat)
            }
        }

        @Test("should move a card into Chat and return the new queue count")
        func movesIn() async throws {
            RecordingStub.install(body: try Fixture.data("chat-queue-moved"))

            let count = try await APIClient.moveToChatQueue(id: "kb/1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb%2F1/chat-queue")
            #expect(count == 3)
        }

        @Test("should send a card back to triage with DELETE")
        func returnsToTriage() async throws {
            RecordingStub.install()

            try await APIClient.returnFromChatQueue(id: "kb_1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "DELETE")
            #expect(request.path == "/knowledge-bits/kb_1/chat-queue")
        }

        @Test("should encode the card id when sending it back to the Inbox")
        func returnsEncodedId() async throws {
            RecordingStub.install()

            try await APIClient.returnFromChatQueue(id: "kb/1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "DELETE")
            #expect(request.path == "/knowledge-bits/kb%2F1/chat-queue")
        }

        @Test("should map sending back a card that left Chat to not-in-chat")
        func returnBlocked() async throws {
            RecordingStub.install(status: 409, body: Data(#"{"error":"not_in_chat"}"#.utf8))

            do {
                try await APIClient.returnFromChatQueue(id: "kb_1")
                Issue.record("expected a failure")
            } catch {
                #expect(ChatQueueFailure.failure(for: error) == .notInChat)
            }
        }

        @Test("should load the saved thread in order with turns left")
        func loadsThread() async throws {
            RecordingStub.install(body: try Fixture.data("chat-queue-thread"))

            let thread = try await APIClient.chatQueueThread(id: "kb_1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/knowledge-bits/kb_1/chat-messages")
            #expect(thread.messages.map(\.role) == [.user, .assistant])
            #expect(thread.turnsLeft == 7)
            #expect(thread.capReached == false)
        }

        @Test("should send the message with its client id and report the cap after the last turn")
        func sendsMessage() async throws {
            RecordingStub.install(body: try Fixture.data("chat-queue-reply"))

            let reply = try await APIClient.sendChatQueueMessage(id: "kb_1", clientMessageId: "m-1", message: "Why?")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb_1/chat-messages")
            #expect(request.body?["clientMessageId"] as? String == "m-1")
            #expect(request.body?["message"] as? String == "Why?")
            #expect(reply.capReached == true)
            #expect(reply.turnsLeft == 0)
        }

        @Test("should read an unknown message role as an assistant message instead of failing the thread")
        func toleratesUnknownRole() throws {
            let json = Data(#"{"messages":[{"seq":1,"role":"system","text":"x","createdAt":"t"}],"turnsLeft":8,"capReached":false}"#.utf8)
            let thread = try JSONDecoder().decode(ChatQueueThread.self, from: json)

            #expect(thread.messages[0].role == .assistant)
        }

        @Test("should map every server error code and status to a plain failure", arguments: [
            (429, "cap_reached", ChatQueueFailure.capReached),
            (423, "budget_paused", .budgetPaused),
            (409, "in_flight", .inFlight),
            (409, "not_in_chat", .notInChat),
            (404, "not_found", .notFound),
            (502, "model_failed", .modelFailed),
            (500, "boom", .other)
        ])
        func mapsErrors(status: Int, code: String, expected: ChatQueueFailure) async throws {
            RecordingStub.install(status: status, body: Data(#"{"error":"\#(code)"}"#.utf8))

            do {
                _ = try await APIClient.sendChatQueueMessage(id: "kb_1", clientMessageId: "m", message: "hi")
                Issue.record("expected a failure")
            } catch {
                #expect(ChatQueueFailure.failure(for: error) == expected)
            }
        }

        @Test("should delete the last exchange and report the turns left")
        func deletesLastExchange() async throws {
            RecordingStub.install(body: Data(#"{"ok":true,"turnsLeft":5,"capReached":false}"#.utf8))

            let result = try await APIClient.deleteLastChatQueueExchange(id: "kb_1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "DELETE")
            #expect(request.path == "/knowledge-bits/kb_1/chat-queue/messages/last")
            #expect(result.turnsLeft == 5)
            #expect(result.capReached == false)
        }

        @Test("should accept a delete response without turns left")
        func toleratesMissingTurns() throws {
            let result = try JSONDecoder().decode(DeleteLastChatExchangeResult.self, from: Data(#"{"ok":true}"#.utf8))

            #expect(result.turnsLeft == nil)
            #expect(result.capReached == false)
        }

        @Test("should map delete failures to a neutral reply-in-progress notice, nothing-to-delete, or a generic error", arguments: [
            (409, "in_flight", "Reply in progress"),
            (404, "no_messages", "There is nothing to delete."),
            (500, "boom", "Could not delete the last exchange. Try again.")
        ])
        func mapsDeleteFailures(status: Int, code: String, expected: String) async throws {
            RecordingStub.install(status: status, body: Data(#"{"error":"\#(code)"}"#.utf8))

            do {
                _ = try await APIClient.deleteLastChatQueueExchange(id: "kb_1")
                Issue.record("expected a failure")
            } catch {
                #expect(ChatQueueFailure.failure(for: error).deleteLastMessage == expected)
            }
        }

        @Test("should treat a lost connection as offline and allow retry")
        func offline() {
            let failure = ChatQueueFailure.failure(for: URLError(.notConnectedToInternet))

            #expect(failure == .offline)
            #expect(failure.canRetry)
            #expect(ChatQueueFailure.capReached.canRetry == false)
        }

        @Test("should save a chat reply as a card with trimmed front and back and return its id")
        func savesCard() async throws {
            RecordingStub.install(status: 201, body: Data(#"{"ok":true,"id":"kb_9"}"#.utf8))

            let id = try await APIClient.createCardFromChatQueueMessage(
                id: "kb_1",
                draft: ChatQueueCardDraft(seq: 4, front: "  Q?  ", back: " A \n")
            )
            let request = try #require(RecordingStub.last)

            #expect(id == "kb_9")
            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb_1/chat-messages/4/card")
            #expect(request.body?["front"] as? String == "Q?")
            #expect(request.body?["back"] as? String == "A")
        }

        @Test("should allow saving only when both sides are filled and within the web caps")
        func cardDraftRules() {
            #expect(ChatQueueCardDraft(seq: 1, front: "Q", back: "A").isSavable)
            #expect(ChatQueueCardDraft(seq: 1, front: "  ", back: "A").isSavable == false)
            #expect(ChatQueueCardDraft(seq: 1, front: "Q", back: "\n").isSavable == false)
            #expect(ChatQueueCardDraft(seq: 1, front: String(repeating: "f", count: 301), back: "A").isSavable == false)
            #expect(ChatQueueCardDraft(seq: 1, front: "Q", back: String(repeating: "b", count: 601)).isSavable == false)
        }

        @Test("should map card save errors to a failure the thread can show")
        func mapsCardSaveFailures() async throws {
            for (status, code, expected) in [(409, "not_in_chat", ChatQueueFailure.notInChat), (404, "not_found", .notFound), (422, "not_assistant_message", .other)] {
                RecordingStub.install(status: status, body: Data(#"{"error":"\#(code)"}"#.utf8))

                do {
                    _ = try await APIClient.createCardFromChatQueueMessage(id: "kb_1", draft: ChatQueueCardDraft(seq: 1, front: "Q", back: "A"))
                    Issue.record("expected a failure")
                } catch {
                    #expect(ChatQueueFailure.failure(for: error) == expected)
                }
            }
        }
    }
}

extension NetworkContracts {
    @Suite("Chat queue review chat flag")
    struct ChatQueueReviewChatTests {
        private func item(_ extra: String) throws -> ChatQueueItem {
            let json = Data(#"{"id":"a","body":"b","origin":"manual","chatAt":"t","turnsLeft":1\#(extra)}"#.utf8)

            return try JSONDecoder().decode(ChatQueueItem.self, from: json)
        }

        @Test("should mark an item as a review chat only when the server says so")
        func decodesReviewChat() throws {
            #expect(try item(#","reviewChat":true"#).reviewChat)
            #expect(try item(#","reviewChat":false"#).reviewChat == false)
            #expect(try item("").reviewChat == false)
        }
    }
}
