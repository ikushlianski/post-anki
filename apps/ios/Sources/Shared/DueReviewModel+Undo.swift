import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func undo() async {
        guard !isGrading, state == .card || state == .empty || isErrorState, let last = lastGraded else {
            return
        }

        isGrading = true
        defer { isGrading = false }

        gradeError = nil
        failedGrade = nil
        notice = nil

        guard let reviewId = last.reviewId else {
            await undoQueued(last)
            return
        }

        await restore(last)
        undoOnServerInBackground(last, reviewId: reviewId)
    }

    func undoQueued(_ last: GradedCard) async {
        switch await gradeQueue.remove(requestId: last.requestId) {
        case .removed:
            await restore(last)
        case .notFound:
            lastGraded = nil
            notice = "Already sent, can't undo"
        case .cancelledInFlight:
            await restore(last)
            runInBackground(bitId: last.card.knowledgeBitId) { [self] in
                await finishCancelledInFlightUndo(last)
            }
        case .sent(let reviewId):
            await restore(last)
            undoOnServerInBackground(last, reviewId: reviewId)
        case .unconfirmed:
            notice = Self.unconfirmedNotice
        }

        pendingCount = await gradeQueue.count()
    }

    private func finishCancelledInFlightUndo(_ last: GradedCard) async {
        switch await gradeQueue.cancelledSendOutcome(requestId: last.requestId) {
        case .notSent:
            return
        case .unconfirmed:
            await reapplyGrade(last, reviewId: nil, keepsUndo: true)
            notice = Self.unconfirmedNotice
        case .sent(let reviewId):
            await sendUndo(last, reviewId: reviewId)
        }
    }

    private func undoOnServerInBackground(_ last: GradedCard, reviewId: String) {
        runInBackground(bitId: last.card.knowledgeBitId) { [self] in
            await sendUndo(last, reviewId: reviewId)
        }
    }

    private func sendUndo(_ last: GradedCard, reviewId: String) async {
        do {
            _ = try await APIClient.undoReview(reviewId: reviewId)
        } catch APIError.badStatus(let status, _) where status == 409 || status == 404 {
            await reapplyGrade(last, reviewId: nil)
            notice = "That grade can't be undone any more. The card stays graded."
        } catch APIError.unauthorized {
            await reapplyGrade(last, reviewId: reviewId)
            gradeError = "Your session expired. Update your token in Settings, then retry."
        } catch {
            await reapplyGrade(last, reviewId: reviewId)
            gradeError = "Couldn't undo that, so the card stays graded. Try again."
        }
    }

    private func reapplyGrade(_ last: GradedCard, reviewId: String?, keepsUndo: Bool = false) async {
        let card = last.card

        guard !settledVariantIds.contains(card.variantId), !card.isRehearsal else { return }

        await reviewPack.noteGraded(variantId: card.variantId, bitId: card.knowledgeBitId)
        reviewedCount += 1

        if last.grade == .easy { easyGradedVariantIds.insert(card.variantId) }

        if last.grade != .again {
            settledVariantIds.insert(card.variantId)
            settledBitIds.insert(card.knowledgeBitId)
        }

        countGraded(card)
        removeFromQueue(afterGrading: card, buriedVariantIds: buriesSiblings || !card.isIndependentCard ? nil : [])
        lastGraded = reviewId != nil || keepsUndo
            ? GradedCard(card: card, grade: last.grade, reviewId: reviewId, requestId: last.requestId)
            : nil

        if current?.variantId == card.variantId { await showNext() }
    }

    func restore(_ last: GradedCard, legacyServer: Bool = true) async {
        await reviewPack.unmarkGraded(variantId: last.card.variantId)
        lastGraded = nil
        easyGradedVariantIds.remove(last.card.variantId)
        settledVariantIds.remove(last.card.variantId)
        settledBitIds.remove(last.card.knowledgeBitId)
        reviewedCount = max(0, reviewedCount - 1)

        if last.card.phase == "new" {
            gradedNewCount = max(0, gradedNewCount - 1)
        } else {
            gradedOtherCount = max(0, gradedOtherCount - 1)
        }

        let legacy = legacyServer || !last.card.isIndependentCard

        if legacy {
            queue.removeAll { $0.knowledgeBitId == last.card.knowledgeBitId }
        } else {
            queue.removeAll { $0.variantId == last.card.variantId }
        }

        if let shown = current, shown.variantId != last.card.variantId,
           !legacy || shown.knowledgeBitId != last.card.knowledgeBitId {
            queue.insert(shown, at: 0)
        }

        noCardsYet = false
        isOffline = false
        present(last.card)
    }
}
