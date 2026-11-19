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

    func setShuffle(_ on: Bool) async {
        guard (shuffleSeed != nil) != on else { return }

        shuffleSeed = on ? UUID().uuidString : nil
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

        let advanced = advanceFirst(past: card, buriedVariantIds: card.isIndependentCard ? [] : nil)

        if advanced != nil { await countKnownLocally(card) }

        do {
            let result = try await APIClient.recordKnownReview(variantId: card.variantId)

            if advanced == nil {
                await countKnownLocally(card)
                removeFromQueue(afterGrading: card, buriedVariantIds: card.isIndependentCard ? [] : nil)
                await showNext()
            }

            knownUndo = KnownUndo(card: card, reviewId: result.reviewId)
        } catch is CancellationError {
            await revertKnownCount(card, rollingBack: advanced)
        } catch let error as URLError where error.code == .cancelled {
            await revertKnownCount(card, rollingBack: advanced)
        } catch {
            if KnowledgeManageError.isGone(error) {
                skippedVariantIds.insert(card.variantId)

                if advanced == nil { await showNext() }

                notice = "That card is no longer available"
            } else {
                await revertKnownCount(card, rollingBack: advanced)
                notice = KnowledgeManageError.message(for: error, action: "mark this card as known")
            }
        }
    }

    private func countKnownLocally(_ card: ReviewCard) async {
        await reviewPack.noteGraded(variantId: card.variantId, bitId: card.knowledgeBitId)
        settledVariantIds.insert(card.variantId)
        reviewedCount += 1
        countGraded(card)
    }

    private func uncountKnown(_ card: ReviewCard) async {
        await reviewPack.unmarkGraded(variantId: card.variantId)
        settledVariantIds.remove(card.variantId)
        reviewedCount = max(0, reviewedCount - 1)

        if card.phase == "new" {
            gradedNewCount = max(0, gradedNewCount - 1)
        } else {
            gradedOtherCount = max(0, gradedOtherCount - 1)
        }
    }

    private func revertKnownCount(_ card: ReviewCard, rollingBack advanced: AdvanceSnapshot?) async {
        guard let advanced else { return }

        await uncountKnown(card)
        rollBack(advanced)
    }

    func undoKnown() async {
        guard !isGrading, let known = knownUndo else { return }

        isGrading = true
        defer { isGrading = false }

        knownUndo = nil
        notice = nil

        do {
            _ = try await APIClient.undoReview(reviewId: known.reviewId)

            await uncountKnown(known.card)
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
