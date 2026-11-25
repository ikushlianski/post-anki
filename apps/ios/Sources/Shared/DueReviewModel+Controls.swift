import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func suspendCurrent(offersUndo: Bool = false) async {
        await applyControl(suspended: true, buried: nil, done: "Card suspended", offersUndo: offersUndo)
    }

    func undoSuspend() async {
        guard !isGrading, let card = suspendedUndo else { return }

        isGrading = true
        defer { isGrading = false }

        suspendedUndo = nil
        notice = nil
        revertedVariantIds.insert(card.variantId)
        putBack(card)

        runInBackground(bitId: card.knowledgeBitId) { [self] in
            await sendUnsuspend(card)
        }
    }

    private func sendUnsuspend(_ card: ReviewCard) async {
        guard revertedVariantIds.remove(card.variantId) != nil else { return }

        do {
            _ = try await APIClient.setSchedule(
                id: card.knowledgeBitId,
                suspended: false,
                buried: nil,
                variantId: card.variantId
            )
        } catch {
            skippedVariantIds.insert(card.variantId)
            suspendedUndo = card
            await takeAway(card)
            notice = "Couldn't unsuspend this card, so it stays suspended. Try again."
        }
    }

    func buryCurrent() async {
        await applyControl(suspended: nil, buried: true, done: "Card buried until tomorrow")
    }

    private func applyControl(suspended: Bool?, buried: Bool?, done: String, offersUndo: Bool = false) async {
        guard !isGrading, let card = current else { return }

        isGrading = true
        defer { isGrading = false }

        gradeError = nil
        notice = nil
        suspendedUndo = nil

        guard let advanced = advanceFirst(past: card, buriedVariantIds: card.isIndependentCard ? [] : nil) else {
            await applyControlWaitingForServer(card, suspended: suspended, buried: buried, done: done, offersUndo: offersUndo)

            return
        }

        skippedVariantIds.insert(card.variantId)

        if offersUndo {
            suspendedUndo = card
        } else {
            notice = done
        }

        runInBackground(bitId: card.knowledgeBitId) { [self] in
            await sendControl(card, advanced: advanced, suspended: suspended, buried: buried, offersUndo: offersUndo)
        }
    }

    private func sendControl(
        _ card: ReviewCard,
        advanced: AdvanceSnapshot,
        suspended: Bool?,
        buried: Bool?,
        offersUndo: Bool
    ) async {
        do {
            _ = try await APIClient.setSchedule(
                id: card.knowledgeBitId,
                suspended: suspended,
                buried: buried,
                variantId: card.variantId
            )
        } catch {
            if offersUndo, suspendedUndo?.variantId == card.variantId { suspendedUndo = nil }

            guard revertedVariantIds.remove(card.variantId) == nil else { return }

            if KnowledgeManageError.isGone(error) {
                skippedVariantIds.insert(card.variantId)
                notice = "That card is no longer available"

                return
            }

            reinsert(advanced)

            if !Self.isCancellation(error) {
                notice = KnowledgeManageError.message(for: error, action: "update this card")
            }
        }
    }

    private func applyControlWaitingForServer(
        _ card: ReviewCard,
        suspended: Bool?,
        buried: Bool?,
        done: String,
        offersUndo: Bool
    ) async {
        do {
            _ = try await APIClient.setSchedule(
                id: card.knowledgeBitId,
                suspended: suspended,
                buried: buried,
                variantId: card.variantId
            )

            removeFromQueue(afterGrading: card, buriedVariantIds: card.isIndependentCard ? [] : nil)
            await showNext()

            if offersUndo {
                suspendedUndo = card
            } else {
                notice = done
            }
        } catch {
            guard !Self.isCancellation(error) else { return }

            if KnowledgeManageError.isGone(error) {
                skippedVariantIds.insert(card.variantId)
                await showNext()
                notice = "That card is no longer available"
            } else {
                notice = KnowledgeManageError.message(for: error, action: "update this card")
            }
        }
    }
}
