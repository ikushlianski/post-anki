import PostAnkiAPI
import SwiftUI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Mac triage arrow keys")
    struct MacTriageArrowKeysSmokeTests {
        typealias Map = PendingReviewTriageKeyMap
        typealias Keys = PendingReviewTriageCommentKeys

        @Test("should reject on left, approve on right and send to chat on up")
        func arrowsDecide() {
            #expect(Map.arrowDecision(for: .left) == .drop)
            #expect(Map.arrowDecision(for: .right) == .keep)
            #expect(Map.arrowDecision(for: .up) == .chat)
            #expect(Map.arrowDecision(for: .down) == nil)
            #expect(Map.arrowDecision(for: .character("x")) == nil)
        }

        @Test("should focus the comment field on N and keep it off the iPhone shortcuts")
        func commentKey() {
            #expect(Map.action(for: .character("n")) == .comment)
            #expect(Map.action(for: .character("n"), command: true) == nil)
            #expect(FocusTriageKeyRouting.intent(forKeyboardInput: "n") == nil)
        }

        @Test("should decide from the card only on a plain arrow")
        func cardNeedsPlainArrow() {
            #expect(Keys.cardDecision(for: .left, modifiers: []) == .drop)
            #expect(Keys.cardDecision(for: .left, modifiers: .numericPad) == .drop)
            #expect(Keys.cardDecision(for: .left, modifiers: .shift) == nil)
            #expect(Keys.cardDecision(for: .left, modifiers: .option) == nil)
            #expect(Keys.cardDecision(for: .right, modifiers: .command) == nil)
        }

        @Test("should decide from the comment field only on exactly Command plus arrow so text selection never rejects")
        func fieldNeedsExactlyCommand() {
            #expect(Keys.fieldDecision(for: .left, modifiers: .command) == .drop)
            #expect(Keys.fieldDecision(for: .right, modifiers: .command) == .keep)
            #expect(Keys.fieldDecision(for: .up, modifiers: .command) == .chat)
            #expect(Keys.fieldDecision(for: .left, modifiers: [.command, .shift]) == nil)
            #expect(Keys.fieldDecision(for: .left, modifiers: [.command, .option]) == nil)
            #expect(Keys.fieldDecision(for: .left, modifiers: []) == nil)
            #expect(Keys.fieldDecision(for: .down, modifiers: .command) == nil)
        }

        @Test("should move pick-one options only with plain Up and Down")
        func optionMoves() {
            #expect(Keys.optionMove(for: .up, modifiers: []) == .moveOption(-1))
            #expect(Keys.optionMove(for: .down, modifiers: []) == .moveOption(1))
            #expect(Keys.optionMove(for: .left, modifiers: []) == nil)
            #expect(Keys.optionMove(for: .down, modifiers: .shift) == nil)
        }

        @Test("should save the typed comment as the rejection note")
        func rejectCarriesNote() async {
            let bits = ["a", "b"].map { FocusTriageFixtures.bit($0) }
            let list = FocusTriageFixtures.list([FocusTriageFixtures.source("s1", bits: bits)])
            let session = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, list),
                "POST /knowledge-bits/a/reject": .json(200, #"{"ok":true,"feedbackId":"f1"}"#),
                "PATCH /knowledge-bit-feedback/f1": .json(200, "{}")
            ])
            defer { session.end() }

            let model = PendingReviewTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.list.load()
            await model.perform(.drop, note: "too vague")
            await model.settlePending()

            let patch = FakeServer.writes.first { $0.method == "PATCH" }

            #expect(patch?.path == "/knowledge-bit-feedback/f1")
            #expect(patch?.bodyObject?["note"] as? String == "too vague")
        }

        @Test("should save the typed comment as the approval note")
        func keepCarriesNote() async {
            let bits = ["a", "b"].map { FocusTriageFixtures.bit($0) }
            let list = FocusTriageFixtures.list([FocusTriageFixtures.source("s1", bits: bits)])
            let session = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, list),
                "POST /knowledge-bits/a/triage": .json(200, #"{"ok":true,"droppedVariantIds":[]}"#),
                "POST /knowledge-bits/a/grades": .json(200, #"{"ok":true}"#)
            ])
            defer { session.end() }

            let model = PendingReviewTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.list.load()
            await model.perform(.keep, note: "good one")
            await model.settlePending()

            let grade = FakeServer.writes.first { $0.path == "/knowledge-bits/a/grades" }

            #expect(grade?.bodyObject?["note"] as? String == "good one")
        }
    }
}
