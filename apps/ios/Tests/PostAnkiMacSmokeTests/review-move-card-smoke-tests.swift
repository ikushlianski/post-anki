import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("The learner can move the card they are reviewing to another deck")
    struct ReviewMoveCardSmokeTests {
        private func cardsJSON() -> String {
            let cards = (1...2).map { index in
                """
                {"variantId":"v0\(index)","knowledgeBitId":"k0\(index)","kind":"wh_question","prompt":"Q\(index)","answer":"A\(index)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"new","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":2,"learning":0,"review":0},\
            "newRemainingToday":2,"nextDueAt":null}
            """
        }

        private func recents() -> RecentMoveTargets {
            let defaults = UserDefaults(suiteName: "review-move-\(UUID().uuidString)") ?? .standard

            return RecentMoveTargets(defaults: defaults)
        }

        @Test("should move the current card, show the next one and remember the deck")
        func movesAndAdvances() async {
            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, cardsJSON()),
                "POST /knowledge-bits/moves": .json(200, #"{"moved":["k01"],"skipped":[]}"#)
            ])
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)
            let store = recents()

            await model.load()
            model.presentMovePicker()

            #expect(model.movePickerCard?.variantId == "v01")

            let moved = await model.moveCurrent(toSubject: "s1", label: "English", recents: store)

            #expect(moved)
            #expect(model.current?.variantId == "v02")
            #expect(model.notice == "Moved to English")
            #expect(model.movePickerCard == nil)
            #expect(store.load() == ["s1"])
        }

        @Test("should keep the card and explain when the server refuses to move it")
        func refusedMoveKeepsCard() async {
            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, cardsJSON()),
                "POST /knowledge-bits/moves": .json(200, #"{"moved":[],"skipped":[{"id":"k01","reason":"curriculum_placed"}]}"#)
            ])
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)
            let store = recents()

            await model.load()
            model.presentMovePicker()

            let moved = await model.moveCurrent(toSubject: "s1", label: "English", recents: store)

            #expect(!moved)
            #expect(model.current?.variantId == "v01")
            #expect(model.moveError?.contains("course") == true)
            #expect(store.load().isEmpty)
        }

        @Test("should list recent decks first and filter the full list by every typed word")
        func recentsAndSearch() {
            let choices = [("a", "Math › Algebra"), ("b", "English › Words"), ("c", "English › Idioms")]
                .map { (id: $0.0, label: $0.1) }

            #expect(RecentMoveTargets.ordered(recent: ["c", "gone", "a"], choices: choices).map(\.id) == ["c", "a"])
            #expect(RecentMoveTargets.filtered(choices, query: "eng id").map(\.id) == ["c"])
            #expect(RecentMoveTargets.filtered(choices, query: " ").count == 3)
        }
    }
}
