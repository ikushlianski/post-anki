import Foundation
import PostAnkiAPI

extension DueReviewModel {
    static let gradeSaveFailedMessage = "Couldn't save that grade. Try again."

    func syncSaveFailure() async {
        guard let failure = await gradeQueue.failure else {
            saveFailure = nil

            return
        }

        saveFailure = SaveFailure(
            id: failure.id,
            bitId: failure.bitId,
            title: unsentCards[failure.id].map(Self.displayPrompt),
            message: Self.gradeSaveFailedMessage
        )
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

        let latest = lastGraded

        if let card = unsentCards.removeValue(forKey: failed.id) {
            await restore(GradedCard(card: card, grade: latest?.grade ?? .again, reviewId: nil, requestId: failed.id))
        }

        if let latest, latest.requestId != failed.id { lastGraded = latest }

        pendingCount = await gradeQueue.count()
        sendPendingInBackground()
    }
}
