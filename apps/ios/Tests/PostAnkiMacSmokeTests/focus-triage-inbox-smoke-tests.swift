import Foundation
import PostAnkiAPI
import Testing

private func bitJSON(_ id: String, background: String? = nil, aiAt: String? = nil) -> String {
    let bg = background.map { #""\#($0)""# } ?? "null"
    let ai = aiAt.map { #""\#($0)""# } ?? "null"

    return #"{"id":"\#(id)","body":"body \#(id)","background":\#(bg),"exampleAiGeneratedAt":\#(ai),"origin":"extracted","variants":[{"id":"\#(id)_v","kind":"basic","prompt":"p","answer":"a"}]}"#
}

private let exampleReply = #"{"knowledgeBitId":"a","example":"AI text","exampleAiGeneratedAt":"2026-10-28T09:00:00.000Z","previousExample":null,"generationsLeft":4}"#

extension SmokeTests {
    @MainActor
    @Suite("Focus triage inbox moves and AI examples")
    struct FocusTriageInboxSmokeTests {
        private func make(
            bits: [String] = [bitJSON("a"), bitJSON("b"), bitJSON("c")],
            extra: [String: FakeReply] = [:]
        ) async -> (FocusTriageModel, FakeServerSession) {
            let list = FocusTriageFixtures.list([FocusTriageFixtures.source("s1", bits: bits)])
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .json(200, list)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let model = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.load()

            return (model, session)
        }

        @Test("should move the card to the Inbox through the API without recording a triage decision")
        func inboxMoveIsNotADecision() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/inbox": .json(200, #"{"ok":true,"inboxCount":1}"#)])
            defer { session.end() }

            let moved = await model.sendToInbox()

            #expect(moved)
            #expect(model.current?.id == "b")
            #expect(model.readyCount == 2)
            #expect(model.log.entries.isEmpty)
            #expect(model.log.cappedDecisions().isEmpty)
            #expect(model.sentToInboxCount == 1)
            #expect(model.list.counts.inboxCount == 1)
            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/inbox"])
        }

        @Test("should bring the card back at its place when Undo follows an Inbox move")
        func undoInboxMove() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/inbox": .json(200, #"{"ok":true,"inboxCount":1}"#),
                "DELETE /knowledge-bits/a/inbox": .json(200, #"{"ok":true}"#)
            ])
            defer { session.end() }

            await model.sendToInbox()

            #expect(model.canUndo)

            await model.undo()

            #expect(model.current?.id == "a")
            #expect(model.readyCount == 3)
            #expect(model.sentToInboxCount == 0)
            #expect(!model.canUndo)
            #expect(model.list.counts.inboxCount == 0)
        }

        @Test("should keep the card, show the connection message and queue nothing when the server is unreachable")
        func inboxMoveOffline() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/inbox": .failure(.notConnectedToInternet)])
            defer { session.end() }

            let moved = await model.sendToInbox()

            #expect(!moved)
            #expect(model.current?.id == "a")
            #expect(model.message == InboxMessages.offline)
            #expect(model.sentToInboxCount == 0)
            #expect(model.log.entries.isEmpty)
            #expect(!model.canUndo)
        }

        @Test("should remove the card with the decided-elsewhere notice when the Inbox move is refused with 409")
        func inboxMoveConflict() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/inbox": .json(409, #"{"error":"blocked"}"#)])
            defer { session.end() }

            let moved = await model.sendToInbox()

            #expect(!moved)
            #expect(model.current?.id == "b")
            #expect(model.notice == "That item was already decided elsewhere, so it was removed.")
        }

        @Test("should send one request when the Inbox button is pressed twice quickly")
        func inboxMoveBusyGuard() async throws {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/inbox": .held(200, #"{"ok":true,"inboxCount":1}"#)])
            defer { session.end() }

            let first = Task { await model.sendToInbox() }

            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }

            let second = await model.sendToInbox()

            FakeServer.releaseHeld()

            #expect(await first.value)
            #expect(!second)
            #expect(FakeServer.writes.count == 1)
        }

        @Test("should show the AI example on the same card and keep the queue unchanged")
        func exampleOnSameCard() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/example": .json(200, exampleReply)])
            defer { session.end() }

            let done = await model.generateExample()

            #expect(done)
            #expect(model.current?.id == "a")
            #expect(model.current?.background == "AI text")
            #expect(model.current?.hasAiExample == true)
            #expect(model.currentExampleLabel == "New AI example")
            #expect(model.exampleGenerationsLeft["a"] == 4)
            #expect(model.log.entries.isEmpty)
            #expect(FakeServer.writes.first?.bodyObject?["overwrite"] == nil)
        }

        @Test("should restore the earlier example text through the edit call when Undo follows an AI example")
        func undoExample() async {
            let (model, session) = await make(
                bits: [bitJSON("a", background: "mine", aiAt: nil), bitJSON("b")],
                extra: [
                    "POST /knowledge-bits/a/example": .json(200, #"{"knowledgeBitId":"a","example":"AI text","exampleAiGeneratedAt":"2026-10-28T09:00:00.000Z","previousExample":"mine","generationsLeft":3}"#),
                    "PATCH /knowledge-bits/a": .json(200, "{}")
                ]
            )
            defer { session.end() }

            await model.generateExample(overwrite: true)
            await model.undo()

            let patch = FakeServer.writes.last

            #expect(patch?.method == "PATCH")
            #expect(patch?.bodyObject?["background"] as? String == "mine")
            #expect(patch?.bodyObject?["body"] as? String == "body a")
            #expect(model.current?.background == "mine")
            #expect(model.current?.hasAiExample == false)
            #expect(!model.canUndo)
        }

        @Test("should ask before replacing a human example and send nothing until the learner confirms")
        func humanExampleNeedsConfirmation() async {
            let (model, session) = await make(
                bits: [bitJSON("a", background: "mine")],
                extra: ["POST /knowledge-bits/a/example": .json(200, exampleReply)]
            )
            defer { session.end() }

            let done = await model.generateExample()

            #expect(!done)
            #expect(model.overwritePromptBitId == "a")
            #expect(FakeServer.writes.isEmpty)

            await model.generateExample(overwrite: true)

            #expect(model.current?.background == "AI text")
            #expect(FakeServer.writes.first?.bodyObject?["overwrite"] as? Bool == true)
        }

        @Test("should show the limit message under the card and disable the button after the fifth example")
        func exampleLimit() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/example": .json(409, #"{"error":"limit_reached"}"#)])
            defer { session.end() }

            let done = await model.generateExample()

            #expect(!done)
            #expect(model.message == "You used all 5 AI examples for this item.")
            #expect(model.exampleLimitReached)
            #expect(model.current?.id == "a")
        }

        @Test("should keep the card and the connection message when the example request cannot reach the server")
        func exampleOffline() async {
            let (model, session) = await make(extra: ["POST /knowledge-bits/a/example": .failure(.notConnectedToInternet)])
            defer { session.end() }

            let done = await model.generateExample()

            #expect(!done)
            #expect(model.message == InboxMessages.offline)
            #expect(model.current?.background == nil)
            #expect(!model.canUndo)
        }

        @Test("should undo the newest action first when an example and an Inbox move are mixed with a decision")
        func undoOrdering() async {
            let (model, session) = await make(extra: [
                "POST /knowledge-bits/a/example": .json(200, exampleReply),
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/b/inbox": .json(200, #"{"ok":true,"inboxCount":1}"#),
                "POST /knowledge-bits/a/restore": .json(200, "{}"),
                "DELETE /knowledge-bits/b/inbox": .json(200, #"{"ok":true}"#),
                "PATCH /knowledge-bits/a": .json(200, "{}")
            ])
            defer { session.end() }

            await model.generateExample()
            await model.approve()
            await model.settlePending()
            await model.sendToInbox()
            await model.undo()

            #expect(model.current?.id == "b")
            #expect(FakeServer.writes.last?.method == "DELETE")

            await model.undo()

            #expect(FakeServer.writes.last?.path == "/knowledge-bits/a/restore")
            #expect(model.current?.id == "a")

            await model.undo()

            #expect(FakeServer.writes.last?.method == "PATCH")
            #expect(!model.canUndo)
        }
    }

    @Suite("Focus triage vertical swipe rules")
    struct FocusTriageVerticalRulesSmokeTests {
        private let top = FocusTriageScrollEdge(atTop: true, atBottom: false)
        private let bottom = FocusTriageScrollEdge(atTop: false, atBottom: true)
        private let middle = FocusTriageScrollEdge()
        private let both = FocusTriageScrollEdge(atTop: true, atBottom: true)

        @Test("should send to Inbox on a 96 pt drag down at the top and send to Chat on a drag up at the bottom")
        func edgesDecideTheAction() {
            #expect(FocusTriageVertical.action(translation: CGSize(width: 4, height: 100), predictedHeight: 120, start: top, end: top) == .inbox)
            #expect(FocusTriageVertical.action(translation: CGSize(width: 4, height: -100), predictedHeight: -120, start: bottom, end: bottom) == .chat)
            #expect(FocusTriageVertical.action(translation: CGSize(width: 0, height: 100), predictedHeight: 100, start: both, end: both) == .inbox)
        }

        @Test("should only scroll when the card is not at the matching edge")
        func midScrollDoesNothing() {
            #expect(FocusTriageVertical.action(translation: CGSize(width: 0, height: 120), predictedHeight: 200, start: middle, end: middle) == nil)
            #expect(FocusTriageVertical.action(translation: CGSize(width: 0, height: 120), predictedHeight: 200, start: top, end: middle) == nil)
            #expect(FocusTriageVertical.action(translation: CGSize(width: 0, height: -120), predictedHeight: -200, start: top, end: top) == nil)
        }

        @Test("should ignore short drags and diagonal drags but accept a quick fling")
        func thresholds() {
            #expect(FocusTriageVertical.action(translation: CGSize(width: 0, height: 60), predictedHeight: 100, start: top, end: top) == nil)
            #expect(FocusTriageVertical.action(translation: CGSize(width: 70, height: 110), predictedHeight: 200, start: top, end: top) == nil)
            #expect(FocusTriageVertical.action(translation: CGSize(width: 0, height: 60), predictedHeight: 400, start: top, end: top) == .inbox)
            #expect(FocusTriageVertical.action(translation: CGSize(width: 0, height: 20), predictedHeight: 400, start: top, end: top) == nil)
        }

        @Test("should keep the horizontal swipe thresholds unchanged")
        func horizontalUnchanged() {
            #expect(FocusTriageSwipe.decision(width: 50, predictedWidth: 50) == .approve)
            #expect(FocusTriageSwipe.decision(width: -50, predictedWidth: -50) == .reject)
            #expect(FocusTriageSwipe.decision(width: 20, predictedWidth: 20) == nil)
        }

        @Test("should read the scroll edges from the content position")
        func measuresEdges() {
            #expect(FocusTriageScrollEdge.measure(contentMinY: 0, contentHeight: 900, viewportHeight: 600) == top)
            #expect(FocusTriageScrollEdge.measure(contentMinY: -300, contentHeight: 900, viewportHeight: 600) == bottom)
            #expect(FocusTriageScrollEdge.measure(contentMinY: -120, contentHeight: 900, viewportHeight: 600) == middle)
            #expect(FocusTriageScrollEdge.measure(contentMinY: 0, contentHeight: 400, viewportHeight: 600) == both)
            #expect(FocusTriageScrollEdge.measure(contentMinY: 0, contentHeight: 0, viewportHeight: 0) == middle)
        }
    }
}
