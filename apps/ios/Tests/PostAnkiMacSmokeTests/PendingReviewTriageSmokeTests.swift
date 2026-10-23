import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Pending review triage selection, keys and decision queue")
    struct PendingReviewTriageSmokeTests {
        private func variants(_ kinds: [String]) throws -> [PendingReviewVariant] {
            let items = kinds.enumerated().map {
                #"{"id":"v\#($0.offset + 1)","kind":"\#($0.element)","prompt":"p\#($0.offset + 1)","answer":"a"}"#
            }

            return try JSONDecoder().decode([PendingReviewVariant].self, from: Data("[\(items.joined(separator: ","))]".utf8))
        }

        private func queue(extra: [String: FakeReply]) async -> (PendingReviewTriageModel, FakeServerSession) {
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .fixture("pending-review")]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let list = PendingReviewListModel()

            await list.load()

            return (PendingReviewTriageModel(list: list), session)
        }

        @Test("should preselect the basic card over fill-in and question when a piece has all three")
        func preselectsBestKind() throws {
            let selection = PendingReviewTriageSelection(variants: try variants(["wh_question", "fill_in_the_blank", "basic"]))

            #expect(selection.keepIds == ["v3"])
            #expect(selection.isSelected("v3"))
        }

        @Test("should preselect a single variant so Return approves at once")
        func preselectsSingleVariant() throws {
            let selection = PendingReviewTriageSelection(variants: try variants(["wh_question"]))

            #expect(selection.keepIds == ["v1"])
            #expect(selection.canKeep)
        }

        @Test("should allow a second keep and ignore a third with a hint")
        func capsKeepsAtTwo() throws {
            var selection = PendingReviewTriageSelection(variants: try variants(["wh_question", "fill_in_the_blank", "basic"]))

            selection.toggle(at: 0)
            selection.toggle(at: 1)

            #expect(selection.keepIds == ["v1", "v3"])
            #expect(selection.hint != nil)
            #expect(!selection.isSelected("v2"))
        }

        @Test("should toggle a kept card off and keep the preselected best when nothing is selected")
        func dropAllFallsBackToBest() throws {
            var selection = PendingReviewTriageSelection(variants: try variants(["wh_question", "basic"]))

            selection.toggle(at: 1)

            #expect(selection.selectedIds.isEmpty)
            #expect(selection.keepIds == ["v2"])
        }

        @Test("should ignore a number with no card and label repeated kinds as reworded")
        func labelsAndIgnoresOutOfRange() throws {
            var selection = PendingReviewTriageSelection(variants: try variants(["wh_question", "wh_question", "fill_in_the_blank", "basic"]))

            selection.toggle(at: 8)

            #expect(selection.hint == nil)
            #expect((0..<4).map { selection.label(at: $0) } == ["Question", "Reworded", "Fill in the gap", "Basic"])
        }

        @Test("should show at most nine cards and count the rest")
        func capsShownCards() throws {
            let selection = PendingReviewTriageSelection(variants: try variants(Array(repeating: "basic", count: 11)))

            #expect(selection.shown.count == 9)
            #expect(selection.hiddenCount == 2)
        }

        @Test("should map digits, Return, Space, X, Delete, Z, S, E and arrows to triage actions")
        func mapsKeys() {
            typealias Map = PendingReviewTriageKeyMap

            #expect(Map.action(for: .character("1")) == .toggle(0))
            #expect(Map.action(for: .character("9")) == .toggle(8))
            #expect(Map.action(for: .character("0")) == nil)
            #expect(Map.action(for: .returnKey) == .keep)
            #expect(Map.action(for: .space) == .keep)
            #expect(Map.action(for: .character("x")) == .drop)
            #expect(Map.action(for: .delete) == .drop)
            #expect(Map.action(for: .character("z")) == .undo)
            #expect(Map.action(for: .character("z"), command: true) == .undo)
            #expect(Map.action(for: .character("S")) == .skip)
            #expect(Map.action(for: .character("e")) == .edit)
            #expect(Map.action(for: .left) == .previous)
            #expect(Map.action(for: .right) == .next)
            #expect(Map.action(for: .character("1"), command: true) == nil)
            #expect(Map.action(for: .character("q")) == nil)
        }

        @Test("should post the kept variants, advance to the next piece and remember the dropped ones for undo")
        func keepAdvances() async throws {
            let (model, session) = await queue(extra: ["POST /knowledge-bits/kb_10/triage": .json(200, #"{"ok":true,"droppedVariantIds":["var_10"]}"#)])
            defer { session.end() }

            #expect(model.current?.id == "kb_10")
            #expect(model.selection.keepIds == ["var_11"])

            await model.perform(.toggle(2))
            await model.perform(.keep)

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/triage"])
            #expect(String(data: FakeServer.writes[0].body ?? Data(), encoding: .utf8)?.contains("var_11") == true)
            #expect(model.current?.id == "kb_11")
            #expect(model.remaining == 1)
            #expect(model.list.pendingUndo == nil)
            #expect(model.list.keptUndo?.restoreVariantIds == ["var_10"])
        }

        @Test("should bring a kept piece back with its dropped variants when Z is pressed after the keep")
        func keepThenUndo() async throws {
            let (model, session) = await queue(extra: [
                "POST /knowledge-bits/kb_10/triage": .json(200, #"{"ok":true,"droppedVariantIds":["var_10"]}"#),
                "POST /knowledge-bits/kb_10/triage/undo": .json(200, #"{"ok":true}"#)
            ])
            defer { session.end() }

            await model.perform(.keep)

            #expect(model.remaining == 1)

            await model.perform(.undo)

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/kb_10/triage", "/knowledge-bits/kb_10/triage/undo"])
            #expect(String(data: FakeServer.writes[1].body ?? Data(), encoding: .utf8)?.contains("var_10") == true)
            #expect(model.current?.id == "kb_10")
            #expect(model.remaining == 2)
            #expect(model.selection.keepIds == ["var_11"])
            #expect(model.list.keptUndo == nil)
        }

        @Test("should explain and stop offering the undo when the server says the piece changed")
        func keepUndoRefused() async throws {
            let (model, session) = await queue(extra: [
                "POST /knowledge-bits/kb_10/triage": .json(200, #"{"ok":true,"droppedVariantIds":["var_10"]}"#),
                "POST /knowledge-bits/kb_10/triage/undo": .json(409, #"{"error":"slot_taken"}"#)
            ])
            defer { session.end() }

            await model.perform(.keep)
            await model.perform(.undo)

            #expect(model.remaining == 1)
            #expect(model.hint?.contains("newer question") == true)
            #expect(model.list.keptUndo == nil)
        }

        @Test("should keep the undo available after an offline failure so Z can retry")
        func keepUndoRetryable() async throws {
            let (model, session) = await queue(extra: [
                "POST /knowledge-bits/kb_10/triage": .json(200, #"{"ok":true,"droppedVariantIds":["var_10"]}"#),
                "POST /knowledge-bits/kb_10/triage/undo": .json(500, #"{"error":"boom"}"#)
            ])
            defer { session.end() }

            await model.perform(.keep)
            await model.perform(.undo)

            #expect(model.list.keptUndo != nil)
            #expect(model.hint != nil)
        }

        @Test("should undo the latest decision only, so a drop after a keep replaces the keep undo")
        func dropReplacesKeepUndo() async throws {
            let (model, session) = await queue(extra: [
                "POST /knowledge-bits/kb_10/triage": .json(200, #"{"ok":true,"droppedVariantIds":["var_10"]}"#),
                "POST /knowledge-bits/kb_11/reject": .json(200, #"{"ok":true,"feedbackId":"fb_01"}"#)
            ])
            defer { session.end() }

            await model.perform(.keep)
            await model.perform(.drop)

            #expect(model.list.keptUndo == nil)
            #expect(model.list.pendingUndo?.removed.bit.id == "kb_11")
            model.list.dismissUndo()
        }

        @Test("should stay on the piece with a message when the keep fails")
        func keepFailureStays() async throws {
            let (model, session) = await queue(extra: ["POST /knowledge-bits/kb_10/triage": .json(409, #"{"error":"variant_not_active"}"#)])
            defer { session.end() }

            await model.perform(.keep)

            #expect(model.current?.id == "kb_10")
            #expect(model.remaining == 2)
            #expect(model.message != nil)
        }

        @Test("should drop through the reject path, advance, and bring the piece back on undo")
        func dropThenUndo() async throws {
            let (model, session) = await queue(extra: [
                "POST /knowledge-bits/kb_10/reject": .json(200, #"{"ok":true,"feedbackId":"fb_01"}"#),
                "POST /knowledge-bits/kb_10/restore": .json(200, "{}")
            ])
            defer { session.end() }

            await model.perform(.drop)

            #expect(model.current?.id == "kb_11")
            #expect(model.list.pendingUndo?.removed.bit.id == "kb_10")

            await model.perform(.undo)

            #expect(model.current?.id == "kb_10")
            #expect(model.remaining == 2)
            model.list.dismissUndo()
        }

        @Test("should say nothing can be undone when no decision was made")
        func undoWithoutDrop() async throws {
            let (model, session) = await queue(extra: [:])
            defer { session.end() }

            await model.perform(.undo)

            #expect(model.hint?.contains("Nothing to undo") == true)
        }

        @Test("should skip with wrap-around and move with clamped arrows without changing the queue")
        func navigation() async throws {
            let (model, session) = await queue(extra: [:])
            defer { session.end() }

            await model.perform(.next)
            await model.perform(.next)

            #expect(model.current?.id == "kb_11")

            await model.perform(.skip)

            #expect(model.current?.id == "kb_10")

            await model.perform(.previous)

            #expect(model.current?.id == "kb_10")
            #expect(model.remaining == 2)
            #expect(FakeServer.writes.isEmpty)
        }
    }
}
