import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Subject hardest cards")
    struct SubjectHardestCardsSmokeTests {
        private func card(_ id: String, lapses: Int, state: String = "review") -> KnowledgeOverviewItem {
            KnowledgeOverviewItem(
                knowledgeBitId: id, question: id, answer: "a", subjectId: "s", state: state, dueAt: nil, lapses: lapses
            )
        }

        @Test("should list the most-lapsed cards first and skip cards that were never failed or are suspended")
        func ranking() {
            let ranked = SubjectHardestCards.rank([
                card("a", lapses: 0), card("b", lapses: 2), card("c", lapses: 5),
                card("d", lapses: 9, state: "suspended"), card("e", lapses: 2)
            ])

            #expect(ranked.map(\.id) == ["c", "b", "e"])
        }

        @Test("should cap the hardest list at the requested size")
        func cap() {
            let cards = (1...8).map { card("c\($0)", lapses: $0) }

            #expect(SubjectHardestCards.rank(cards, limit: 5).count == 5)
        }

        @Test("should mark the card total as a lower bound when more cards exist than were loaded")
        func countText() {
            let cards = [card("a", lapses: 1)]

            #expect(SubjectHardestCards.countText(cards: cards, hasMore: false) == "1")
            #expect(SubjectHardestCards.countText(cards: cards, hasMore: true) == "1+")
        }

        @Test("should default the gap action to the hardest card until the owner picks another")
        @MainActor
        func selection() {
            let hardest = [card("x", lapses: 3), card("y", lapses: 2)]
            let model = SubjectGapCloseModel()

            #expect(model.effectiveId(in: hardest) == "x")

            model.selectedId = "y"

            #expect(model.effectiveId(in: hardest) == "y")

            model.selectedId = "gone"

            #expect(model.effectiveId(in: hardest) == "x")
        }
    }
}
