import Testing
@testable import PostAnkiAPI

@Suite("Rejected bulk restore")
struct RejectedBulkRestoreTests {
    @Test("should toggle a card on and off")
    func toggles() {
        var selection = RejectedSelection()

        selection.toggle("a")
        selection.toggle("b")
        selection.toggle("a")

        #expect(selection.ids == ["b"])
    }

    @Test("should drop selected cards that left the list")
    func prunes() {
        var selection = RejectedSelection()

        selection.selectAll(["a", "b", "c"])
        selection.keepOnly(["b", "c", "d"])

        #expect(selection.ids == ["b", "c"])
    }

    @Test("should restore selected cards in list order and report select-all state")
    func ordering() {
        var selection = RejectedSelection()

        selection.toggle("c")
        selection.toggle("a")

        #expect(selection.orderedIds(in: ["a", "b", "c"]) == ["a", "c"])
        #expect(!selection.allSelected(in: ["a", "b", "c"]))

        selection.selectAll(["a", "b"])

        #expect(selection.allSelected(in: ["a", "b"]))
        #expect(!selection.allSelected(in: []))
    }

    @Test("should show the selected count on the restore button")
    func title() {
        var selection = RejectedSelection()

        selection.toggle("a")

        #expect(selection.buttonTitle(isRunning: false) == "Restore selected (1)")
        #expect(selection.buttonTitle(isRunning: true) == "Restoring…")
    }

    @Test("should remove restored and already gone cards and keep failed ones")
    func partialFailure() {
        let result = RejectedBulkRestoreResult(outcomes: [("a", .restored), ("b", .failed), ("c", .alreadyGone), ("d", .notRejected), ("e", .failed)])

        #expect(result.removed == ["a", "c"])
        #expect(result.failed == ["b", "e"])
        #expect(result.stale)
        #expect(result.restoredAny)
        #expect(result.announcement == "2 cards restored")
    }

    @Test("should name the failed cards in the message")
    func message() {
        let result = RejectedBulkRestoreResult(outcomes: [("a", .failed), ("b", .failed), ("c", .failed), ("d", .failed)])

        #expect(result.message(failedPreviews: ["one", "two", "three", "four"]) == "Couldn't restore 4 cards: \"one\", \"two\", \"three\" and 1 more. They stay selected.")
        #expect(RejectedBulkRestoreResult(outcomes: [("a", .restored)]).message(failedPreviews: []) == nil)
        #expect(RejectedBulkRestoreResult(outcomes: [("a", .failed)]).announcement == nil)
    }
}

@Suite("Rejected selection after list changes")
struct RejectedSelectionPruneTests {
    @Test("should not count selected or failed cards hidden by a reload or filter change")
    func prunesHidden() {
        var selection = RejectedSelection()

        selection.selectAll(["a", "b", "c"])
        selection.markFailed(["a", "c"])
        selection.keepOnly(["b", "c"])

        #expect(selection.count == 2)
        #expect(selection.hasFailed("c"))
        #expect(!selection.hasFailed("a"))
        #expect(selection.orderedIds(in: ["c"]) == ["c"])
        #expect(selection.buttonTitle(isRunning: false) == "Restore selected (2)")
    }

    @Test("should clear the failed mark when a card is retried")
    func retry() {
        var selection = RejectedSelection()

        selection.markFailed(["a", "b"])
        selection.clearFailed(["a"])

        #expect(!selection.hasFailed("a"))
        #expect(selection.hasFailed("b"))
    }

    @Test("should keep the failure message when a run has both failed and stale cards")
    func messageWithStale() {
        let result = RejectedBulkRestoreResult(outcomes: [("a", .failed), ("b", .notRejected)])

        #expect(result.message(failedPreviews: ["one"]) == "Couldn't restore 1 card: \"one\". They stay selected. Some cards are no longer rejected. List refreshed.")
    }
}
