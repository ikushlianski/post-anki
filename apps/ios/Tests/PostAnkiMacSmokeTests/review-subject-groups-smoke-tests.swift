import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Today review goes subject by subject")
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

        @Test("should count the cards left in the current subject group only")
        func countsGroup() {
            let queue = [card("b", "Sales"), card("c", "Swift")]

            #expect(ReviewSubjectGroups.cardsLeft(in: "Sales", current: card("a", "Sales"), queue: queue) == 2)
        }

        @Test("should announce the next subject with its card count and the total left")
        func announces() {
            let text = ReviewSubjectGroups.announcement(subjectPath: "Swift", cardsInGroup: 3, remainingOverall: 8)

            #expect(text == "Next subject: Swift · 3 cards here, 8 cards left in total")
        }
    }
}
