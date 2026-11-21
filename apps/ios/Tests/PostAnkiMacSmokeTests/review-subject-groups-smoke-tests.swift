import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Today review announces the next subject")
    struct ReviewSubjectGroupsSmokeTests {
        private func card(_ id: String, _ path: String?) -> ReviewCard {
            ReviewCard(
                variantId: id,
                knowledgeBitId: "k\(id)",
                kind: "wh_question",
                prompt: "Q",
                answer: "A",
                background: nil,
                phase: "review",
                leech: false,
                intervalPreview: IntervalPreview(again: 1, hard: 2, good: 3, easy: 4),
                subjectPath: path
            )
        }

        @Test("should announce the next subject and cards left when the next card changes subject")
        func announcesChange() {
            let text = ReviewSubjectGroups.nextAnnouncement(
                current: card("a", "Sales"),
                queue: [card("b", "Swift"), card("c", "Swift")],
                remainingAfterCurrent: 2
            )

            #expect(text == "Next: Swift · 2 left")
        }

        @Test("should stay silent while the next card is in the same subject")
        func silentSameSubject() {
            let text = ReviewSubjectGroups.nextAnnouncement(
                current: card("a", "Sales"),
                queue: [card("b", "Sales"), card("c", "Swift")],
                remainingAfterCurrent: 2
            )

            #expect(text == nil)
        }

        @Test("should follow the shuffled queue order, not the original one")
        func followsQueueOrder() {
            let current = card("a", "Sales")
            let shuffled = [card("c", "Swift"), card("b", "Sales")]

            #expect(ReviewSubjectGroups.nextAnnouncement(current: current, queue: shuffled, remainingAfterCurrent: 2) == "Next: Swift · 2 left")
            #expect(ReviewSubjectGroups.nextAnnouncement(current: current, queue: shuffled.reversed(), remainingAfterCurrent: 2) == nil)
        }

        @Test("should stay silent when the queue is empty or the next card has no subject")
        func silentWithoutSubject() {
            #expect(ReviewSubjectGroups.nextAnnouncement(current: card("a", "Sales"), queue: [], remainingAfterCurrent: 0) == nil)
            #expect(ReviewSubjectGroups.nextAnnouncement(current: card("a", "Sales"), queue: [card("b", nil)], remainingAfterCurrent: 1) == nil)
        }
    }
}
