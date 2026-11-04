import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chatting about a card keeps the review where it was")
    struct DueReviewChatSmokeTests {
        private func makeModel() -> (DueReviewModel, URL) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("chat-\(UUID().uuidString).json")

            return (DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file)), file)
        }

        @Test("should keep the same card revealed after the chat is closed")
        func chatKeepsCardAndRevealState() async {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .fixture("review-cards")])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()
            model.reveal()

            let cardId = model.current?.id
            model.chatCard = model.current
            model.chatCard = nil

            #expect(model.current?.id == cardId)
            #expect(model.isRevealed)
            #expect(model.reviewedCount == 0)
        }

        @Test("should open the chat on the card's own knowledge item")
        func chatTargetsCurrentCard() async throws {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .fixture("review-cards")])
            defer { session.end() }

            let (model, file) = makeModel()
            defer { try? FileManager.default.removeItem(at: file) }

            await model.load()
            model.chatCard = model.current

            let card = try #require(model.chatCard)

            #expect(card.knowledgeBitId == model.current?.knowledgeBitId)
            #expect(DueReviewChatSheet.bitBody(for: card).contains(card.answer))
        }
    }
}
