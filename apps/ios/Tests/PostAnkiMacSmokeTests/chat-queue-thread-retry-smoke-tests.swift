import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat thread retry answer")
    struct ChatQueueThreadRetrySmokeTests {
        private let threadPath = "/knowledge-bits/k1/chat-messages"
        private let deletePath = "/knowledge-bits/k1/chat-queue/messages/last"
        private let thread = #"{"messages":[{"seq":1,"role":"user","text":"Why?","createdAt":"t"},{"seq":2,"role":"assistant","text":"Because.","createdAt":"t"}],"turnsLeft":6,"capReached":false}"#
        private let deleted = #"{"turnsLeft":7,"capReached":false}"#
        private let reply = #"{"reply":"Better answer","turnsLeft":6,"capReached":false}"#

        private func make(
            delete: FakeReply,
            send: FakeReply
        ) async -> (ChatQueueThreadModel, FakeServerSession) {
            let session = FakeServerSession([
                "GET \(threadPath)": .json(200, thread),
                "DELETE \(deletePath)": delete,
                "POST \(threadPath)": send
            ])
            let item = ChatQueueItem(id: "k1", body: "Card", chatAt: "t", turnsLeft: 6)
            let model = ChatQueueThreadModel(item: item, counts: .shared, drafts: InMemoryChatQueueDraftStore())

            await model.load()

            return (model, session)
        }

        @Test("should delete the last exchange before resending the same question")
        func deletesThenResends() async {
            let (model, session) = await make(delete: .json(200, deleted), send: .json(200, reply))
            defer { session.end() }

            await model.retryLast()

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["DELETE \(deletePath)", "POST \(threadPath)"])
            #expect(FakeServer.writes.last?.bodyObject?["message"] as? String == "Why?")
            #expect(model.lines.map(\.text) == ["Why?", "Better answer"])
            #expect(model.turnsLeft == 6)
            #expect(model.errorMessage == nil)
            #expect(!model.isSending)
            #expect(!model.isDeleting)
        }

        @Test("should put the question back above a typed draft when the resend fails")
        func resendFailureKeepsQuestion() async {
            let (model, session) = await make(delete: .json(200, deleted), send: .status(500))
            defer { session.end() }

            model.draft = "my follow-up"

            await model.retryLast()

            #expect(model.draft == "Why?\n\nmy follow-up")
            #expect(model.lines.isEmpty)
            #expect(model.errorMessage != nil)
            #expect(!model.isSending)
        }

        @Test("should restore the question as the whole draft when nothing was typed and the resend fails")
        func resendFailureEmptyDraft() async {
            let (model, session) = await make(delete: .json(200, deleted), send: .failure(.notConnectedToInternet))
            defer { session.end() }

            await model.retryLast()

            #expect(model.draft == "Why?")
            #expect(model.errorMessage == ChatQueueFailure.offline.message)
        }

        @Test("should leave the thread alone and not resend when deleting the old answer fails")
        func deleteFailureDoesNotResend() async {
            let (model, session) = await make(delete: .status(500), send: .json(200, reply))
            defer { session.end() }

            model.draft = "typed"

            await model.retryLast()

            #expect(FakeServer.writes.map { "\($0.method) \($0.path)" } == ["DELETE \(deletePath)"])
            #expect(model.lines.map(\.text) == ["Why?", "Because."])
            #expect(model.draft == "typed")
            #expect(model.errorMessage == ChatQueueFailure.other.deleteLastMessage)
            #expect(!model.isSending)
            #expect(!model.isDeleting)
        }

        @Test("should ignore a second Retry while the first is still deleting")
        func doubleInvocationIgnored() async {
            let (model, session) = await make(delete: .held(200, deleted), send: .json(200, reply))
            defer { session.end() }

            let first = Task { await model.retryLast() }

            while FakeServer.heldCount == 0 { await Task.yield() }

            await model.retryLast()

            #expect(FakeServer.writes.count == 1)

            FakeServer.releaseHeld()
            await first.value

            #expect(FakeServer.writes.map(\.method) == ["DELETE", "POST"])
            #expect(model.lines.map(\.text) == ["Why?", "Better answer"])
        }
    }
}
