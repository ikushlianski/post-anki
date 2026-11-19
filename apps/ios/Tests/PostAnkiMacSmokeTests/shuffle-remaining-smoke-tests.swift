import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Shuffling mixes only the cards not answered yet")
    struct ShuffleRemainingSmokeTests {
        private typealias Pack = ReviewPackStoreSmokeTests

        private func cardsJSON(_ range: ClosedRange<Int>) -> String {
            let cards = range.map { index -> String in
                let id = String(format: "%02d", index)

                return """
                {"variantId":"v\(id)","knowledgeBitId":"k\(id)","kind":"wh_question","prompt":"Q\(id)","answer":"A\(id)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"review","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":0,"learning":0,"review":\(range.count)},\
            "newRemainingToday":0,"nextDueAt":null}
            """
        }

        private func ids(_ model: DueReviewModel) -> [String] {
            model.queue.map(\.variantId)
        }

        @Test("should keep the card on screen and reorder only the cards still waiting")
        func keepsCurrentAndReorders() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, cardsJSON(1...20))])
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()

            let current = model.current?.variantId
            let before = ids(model)

            model.shuffleRemaining()

            #expect(model.current?.variantId == current)
            #expect(ids(model) != before)
            #expect(Set(ids(model)) == Set(before))
            #expect(ids(model).count == before.count)
        }

        @Test("should mix again every time it is used and never repeat or drop a card")
        func repeatedShuffleKeepsEveryCard() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, cardsJSON(1...20))])
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()

            let before = ids(model)
            var seen: Set<[String]> = [before]

            for _ in 0..<3 {
                model.shuffleRemaining()
                seen.insert(ids(model))

                #expect(ids(model).count == Set(ids(model)).count)
                #expect(Set(ids(model)) == Set(before))
                #expect(!ids(model).contains(model.current?.variantId ?? ""))
            }

            #expect(seen.count > 2)
        }

        @Test("should not bring back a graded card when shuffling after answering")
        func gradedCardStaysGone() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, cardsJSON(1...20))])
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()

            let answered = model.current?.variantId ?? ""

            await model.showNext()
            model.shuffleRemaining()

            #expect(model.current?.variantId != answered)
            #expect(!ids(model).contains(answered))
        }

        @Test("should keep the new cards mixed when the queue refills")
        func refillStaysShuffled() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .json(200, cardsJSON(1...30))])
            defer { session.end() }
            let model = DueReviewModel(repeatOnly: false, retryDelay: nil)

            await model.load()
            model.shuffleRemaining()

            let keep = Array(ids(model).prefix(3))
            let held = Array(model.queue.prefix(3))

            model.queue = held
            model.topUpIfNeeded()
            await model.topUpTask?.value

            #expect(model.isShuffled)
            #expect(ids(model).count == Set(ids(model)).count)
            #expect(Set(keep).isSubset(of: Set(ids(model))))
            #expect(!ids(model).contains(model.current?.variantId ?? ""))
        }

        @Test("should shuffle offline from the saved pack without asking the server")
        func offlineShuffle() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .failure(.notConnectedToInternet)])
            defer { session.end() }
            let queueFile = FileManager.default.temporaryDirectory.appendingPathComponent("shuffle-q-\(UUID().uuidString).json")
            let packFile = FileManager.default.temporaryDirectory.appendingPathComponent("shuffle-p-\(UUID().uuidString).json")
            defer { [queueFile, packFile].forEach { try? FileManager.default.removeItem(at: $0) } }
            let store = ReviewPackStore(fileURL: packFile)
            let packCards = (1...12).map { ReviewPackCard(card: Pack.card(String(format: "c%02d", $0)), subjectId: "s1") }

            await store.replace(Pack.pack(packCards), fetchStartedAt: Date())

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: queueFile), reviewPack: store, retryDelay: nil)

            await model.load()

            let current = model.current?.variantId
            let before = ids(model)

            model.shuffleRemaining()

            #expect(model.isServingPack)
            #expect(model.current?.variantId == current)
            #expect(ids(model) != before)
            #expect(Set(ids(model)) == Set(before))
        }
    }
}
