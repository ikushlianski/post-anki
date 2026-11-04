import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func syncSaveFailure() async {
        guard var failure = await gradeQueue.failure else {
            saveFailure = nil

            return
        }

        failure.title = unsentCards[failure.id].map(Self.displayPrompt)
        saveFailure = failure
    }

    func retryFailedSave() async {
        await gradeQueue.retryFailed()
        saveFailure = nil
        sendPendingInBackground()
    }

    func skipFailedSave() async {
        guard let failed = saveFailure else { return }

        await gradeQueue.skipFailed()
        saveFailure = nil

        if let card = unsentCards.removeValue(forKey: failed.id) {
            reviewedCount = max(0, reviewedCount - 1)

            if card.phase == "new" {
                gradedNewCount = max(0, gradedNewCount - 1)
            } else {
                gradedOtherCount = max(0, gradedOtherCount - 1)
            }

            skippedVariantIds.insert(card.variantId)
        }

        if lastGraded?.requestId == failed.id { lastGraded = nil }

        pendingCount = await gradeQueue.count()
        sendPendingInBackground()
    }
}
