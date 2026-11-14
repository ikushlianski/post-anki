import Foundation
import PostAnkiAPI

struct KnownUndo: Sendable {
    let card: ReviewCard
    let reviewId: String
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

        do {
            let result = try await APIClient.recordKnownReview(variantId: card.variantId)

            await reviewPack.noteGraded(variantId: card.variantId, bitId: card.knowledgeBitId)
            settledVariantIds.insert(card.variantId)
            reviewedCount += 1
            countGraded(card)
            removeFromQueue(afterGrading: card, buriedVariantIds: card.isIndependentCard ? [] : nil)
            await showNext()
            knownUndo = KnownUndo(card: card, reviewId: result.reviewId)
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            if KnowledgeManageError.isGone(error) {
                skippedVariantIds.insert(card.variantId)
                await showNext()
                notice = "That card is no longer available"
            } else {
                notice = KnowledgeManageError.message(for: error, action: "mark this card as known")
            }
        }
    }

    func undoKnown() async {
        guard !isGrading, let known = knownUndo else { return }

        isGrading = true
        defer { isGrading = false }

        knownUndo = nil
        notice = nil

        do {
            _ = try await APIClient.undoReview(reviewId: known.reviewId)

            await reviewPack.unmarkGraded(variantId: known.card.variantId)
            settledVariantIds.remove(known.card.variantId)
            reviewedCount = max(0, reviewedCount - 1)

            if known.card.phase == "new" {
                gradedNewCount = max(0, gradedNewCount - 1)
            } else {
                gradedOtherCount = max(0, gradedOtherCount - 1)
            }

            queue.removeAll { $0.variantId == known.card.variantId }

            if let shown = current, shown.variantId != known.card.variantId {
                queue.insert(shown, at: 0)
            }

            present(known.card)
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch APIError.badStatus(let status, _) where status == 409 || status == 404 {
            notice = "That can't be undone any more."
        } catch {
            notice = KnowledgeManageError.message(for: error, action: "undo this")
        }
    }
}
