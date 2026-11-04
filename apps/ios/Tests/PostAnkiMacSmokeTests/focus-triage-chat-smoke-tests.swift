import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage Chat moves and decision list")
    struct FocusTriageChatSmokeTests {
        private let moved = #"{"ok":true,"chatCount":2}"#
        private let started = #"{"id":"ts1","subjectId":null,"status":"open","startedAt":"2026-10-24T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
        private let decision = #"{"id":"d1","bitId":"a","verdict":"approved"}"#

        private func make(extra: [String: FakeReply] = [:]) async -> (FocusTriageModel, FakeServerSession) {
            let bits = ["a", "b", "c"].map { FocusTriageFixtures.bit($0) }
            let list = FocusTriageFixtures.list([FocusTriageFixtures.source("s1", bits: bits)])
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .json(200, list)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.load()

            return (model, session)
        }

        @Test("should park the card in Chat without recording a triage decision")
        func chatMoveIsNotADecision() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/chat-queue": .json(200, moved)])
            defer { session.end() }

            #expect(await model.sendToChat())
            #expect(model.current?.id == "b")
            #expect(model.readyCount == 2)
            #expect(model.sentToChatCount == 1)
            #expect(model.log.entries.isEmpty)
            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/chat-queue"])
        }

        @Test("should bring the card back at its place when Undo follows a Chat move")
        func undoChatMove() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/chat-queue": .json(200, moved),
                "DELETE /knowledge-bits/a/chat-queue": .json(200, #"{"ok":true}"#)
            ])
            defer { session.end() }

            await model.sendToChat()

            #expect(model.canUndo)

            await model.undo()

            #expect(model.current?.id == "a")
            #expect(model.readyCount == 3)
            #expect(model.sentToChatCount == 0)
        }

        @Test("should keep the card in the stack with a connection message when the Chat move fails offline")
        func chatMoveOffline() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/chat-queue": .failure(.notConnectedToInternet)])
            defer { session.end() }

            #expect(!(await model.sendToChat()))
            #expect(model.current?.id == "a")
            #expect(model.sentToChatCount == 0)
            #expect(!model.canUndo)
        }

        @Test("should list rejected cards first, then Chat, then Inbox, then accepted in the decision rows")
        func rowsKeepEveryKind() async {
            let (model, session) = await make(extra: [
                "POST /triage-sessions": .json(201, started),
                "POST /knowledge-bits/a/chat-queue": .json(200, moved),
                "POST /knowledge-bits/b/inbox": .json(200, #"{"ok":true,"inboxCount":1}"#),
                "POST /knowledge-bits/c/approve": .json(200, "{}"),
                "PUT /triage-sessions/ts1/decisions/c": .json(200, decision)
            ])
            defer { session.end() }

            let sessionModel = FocusTriageSessionModel(triage: model, store: FocusTriageSessionStore(
                defaults: UserDefaults(suiteName: "focus-triage-chat-\(UUID().uuidString)") ?? .standard,
                scope: { "https://one" }
            ))

            await sessionModel.start()
            await model.sendToChat()
            await model.sendToInbox()
            await model.approve()
            await model.settlePending()

            let kinds = Set(sessionModel.decisionRows.map(\.kind))

            #expect(kinds == [.chat, .inbox, .approved])
            #expect(sessionModel.decisionRows.first { $0.kind == .chat }?.bitId == "a")
            #expect(sessionModel.decisionRows.first { $0.kind == .inbox }?.bitId == "b")
        }
    }
}
