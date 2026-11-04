import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func grade(_ grade: ReviewGrade) async {
        guard !isGrading, isRevealed, let card = current else { return }

        isGrading = true
        defer { isGrading = false }

        gradeError = nil
        failedGrade = nil
        notice = nil

        let input = makeInput(for: card, grade: grade)

        guard await gradeQueue.enqueue(input, knowledgeBitId: card.knowledgeBitId) else {
            gradeError = "Couldn't save that."
            failedGrade = grade

            return
        }

        let requestId = input.requestId ?? cardRequestId

        unsentCards[requestId] = card

        if card.isRehearsal {
            lastGraded = nil
        } else {
            recordLiveGrade(card, grade: grade, requestId: requestId)
        }

        pendingCount += 1
        sendPendingInBackground()
        await showNext()
    }

    private func recordLiveGrade(_ card: ReviewCard, grade: ReviewGrade, requestId: String) {
        lastGraded = GradedCard(card: card, grade: grade, reviewId: nil, requestId: requestId)
        reviewedCount += 1

        if grade == .easy { easyGradedVariantIds.insert(card.variantId) }

        if grade != .again {
            settledVariantIds.insert(card.variantId)
            settledBitIds.insert(card.knowledgeBitId)
        }

        countGraded(card)
        removeFromQueue(afterGrading: card, buriedVariantIds: buriesSiblings || !card.isIndependentCard ? nil : [])

        if grade != .again { followUpEligible.insert(requestId) }
    }

    func countGraded(_ card: ReviewCard) {
        if card.phase == "new" {
            gradedNewCount += 1
        } else {
            gradedOtherCount += 1
        }
    }
}
