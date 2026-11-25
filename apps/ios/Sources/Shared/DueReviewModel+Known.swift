import Foundation
import PostAnkiAPI

struct KnownUndo: Sendable {
    let card: ReviewCard
    let reviewId: String?
    let token: UUID
}

extension DueReviewModel {
    func setRepeatOnly(_ value: Bool) async {
        guard repeatOnly != value else { return }

        repeatOnly = value
        RepeatOnlyPreference.isOn = value
        await load()
    }

    func markCurrentKnown() async {
        guard !isGrading, let card = current, !card.isRehearsal else { return }

        isGrading = true
        defer { isGrading = false }

        gradeError = nil
        notice = nil
        suspendedUndo = nil
        knownUndo = nil

        guard let advanced = advanceFirst(past: card, buriedVariantIds: card.isIndependentCard ? [] : nil) else {
            await markKnownWaitingForServer(card)

            return
        }

        await countKnownLocally(card)

        let token = UUID()

        knownUndo = KnownUndo(card: card, reviewId: nil, token: token)
        runInBackground(bitId: card.knowledgeBitId) { [self] in
            await sendKnown(card, advanced: advanced, token: token)
        }
    }

    private func sendKnown(_ card: ReviewCard, advanced: AdvanceSnapshot, token: UUID) async {
        do {
            let result = try await APIClient.recordKnownReview(variantId: card.variantId)

            knownReviewIds[card.variantId] = result.reviewId

            if knownUndo?.token == token {
                knownUndo = KnownUndo(card: card, reviewId: result.reviewId, token: token)
            }
        } catch {
            if knownUndo?.token == token { knownUndo = nil }

            guard revertedVariantIds.remove(card.variantId) == nil else { return }

            await uncountKnown(card)

            if KnowledgeManageError.isGone(error) {
                skippedVariantIds.insert(card.variantId)
                notice = "That card is no longer available"
            } else {
                reinsert(advanced)

                if !Self.isCancellation(error) {
                    notice = KnowledgeManageError.message(for: error, action: "mark this card as known")
                }
            }
        }
    }

    private func markKnownWaitingForServer(_ card: ReviewCard) async {
        do {
            let result = try await APIClient.recordKnownReview(variantId: card.variantId)

            await countKnownLocally(card)
            removeFromQueue(afterGrading: card, buriedVariantIds: card.isIndependentCard ? [] : nil)
            await showNext()

            knownUndo = KnownUndo(card: card, reviewId: result.reviewId, token: UUID())
            knownReviewIds[card.variantId] = result.reviewId
        } catch {
            guard !Self.isCancellation(error) else { return }

            if KnowledgeManageError.isGone(error) {
                skippedVariantIds.insert(card.variantId)
                await showNext()
                notice = "That card is no longer available"
            } else {
                notice = KnowledgeManageError.message(for: error, action: "mark this card as known")
            }
        }
    }

    func countKnownLocally(_ card: ReviewCard) async {
        await reviewPack.noteGraded(variantId: card.variantId, bitId: card.knowledgeBitId)
        settledVariantIds.insert(card.variantId)
        reviewedCount += 1
        countGraded(card)
    }

    func uncountKnown(_ card: ReviewCard) async {
        await reviewPack.unmarkGraded(variantId: card.variantId)
        settledVariantIds.remove(card.variantId)
        reviewedCount = max(0, reviewedCount - 1)

        if card.phase == "new" {
            gradedNewCount = max(0, gradedNewCount - 1)
        } else {
            gradedOtherCount = max(0, gradedOtherCount - 1)
        }
    }
}
