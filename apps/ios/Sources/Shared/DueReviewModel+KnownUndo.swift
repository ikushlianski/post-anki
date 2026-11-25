import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func undoKnown() async {
        guard !isGrading, let known = knownUndo else { return }

        isGrading = true
        defer { isGrading = false }

        knownUndo = nil
        notice = nil

        let card = known.card
        let sentId = known.reviewId

        if sentId == nil { revertedVariantIds.insert(card.variantId) }

        await uncountKnown(card)
        putBack(card)

        runInBackground(bitId: card.knowledgeBitId) { [self] in
            await sendKnownUndo(card, sentId: sentId)
        }
    }

    private func sendKnownUndo(_ card: ReviewCard, sentId: String?) async {
        if sentId == nil {
            guard revertedVariantIds.remove(card.variantId) != nil else { return }
        }

        guard let reviewId = sentId ?? knownReviewIds[card.variantId] else { return }

        knownReviewIds[card.variantId] = nil

        do {
            _ = try await APIClient.undoReview(reviewId: reviewId)
        } catch APIError.badStatus(let status, _) where status == 409 || status == 404 {
            await reapplyKnown(card, reviewId: nil)
            notice = "That can't be undone any more. The card stays marked as known."
        } catch {
            await reapplyKnown(card, reviewId: reviewId)
            notice = "Couldn't undo that, so the card stays marked as known. Try again."
        }
    }

    private func reapplyKnown(_ card: ReviewCard, reviewId: String?) async {
        guard !settledVariantIds.contains(card.variantId) else { return }

        await countKnownLocally(card)
        removeFromQueue(afterGrading: card, buriedVariantIds: card.isIndependentCard ? [] : nil)

        if let reviewId {
            knownReviewIds[card.variantId] = reviewId
            knownUndo = KnownUndo(card: card, reviewId: reviewId, token: UUID())
        }

        if current?.variantId == card.variantId { await showNext() }
    }
}
