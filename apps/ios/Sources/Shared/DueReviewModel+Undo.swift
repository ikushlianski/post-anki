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

        await performServerUndo(last, reviewId: reviewId, keepReviewIdOnFailure: false)
    }

    func undoQueued(_ last: GradedCard) async {
        switch await gradeQueue.remove(requestId: last.requestId) {
        case .removed:
            restore(last)
        case .notFound:
            lastGraded = nil
            notice = "Already sent, can't undo"
        case .cancelledInFlight:
            await undoCancelledInFlight(last)
        case .sent(let reviewId):
            await performServerUndo(last, reviewId: reviewId, keepReviewIdOnFailure: true)
        case .unconfirmed:
            notice = Self.unconfirmedNotice
        }

        pendingCount = await gradeQueue.count()
    }

    func undoCancelledInFlight(_ last: GradedCard) async {
        switch await gradeQueue.cancelledSendOutcome(requestId: last.requestId) {
        case .notSent:
            restore(last)
        case .unconfirmed:
            notice = Self.unconfirmedNotice
        case .sent(let reviewId):
            await performServerUndo(last, reviewId: reviewId, keepReviewIdOnFailure: true)
        }
    }

    func performServerUndo(_ last: GradedCard, reviewId: String, keepReviewIdOnFailure: Bool) async {
        do {
            _ = try await APIClient.undoReview(reviewId: reviewId)

            restore(last)
        } catch is CancellationError {
            keepReviewId(last, reviewId: reviewId, keep: keepReviewIdOnFailure)
        } catch let error as URLError where error.code == .cancelled {
            keepReviewId(last, reviewId: reviewId, keep: keepReviewIdOnFailure)
        } catch APIError.badStatus(let status, _) where status == 409 || status == 404 {
            lastGraded = nil
            notice = "That grade can't be undone any more."
        } catch APIError.unauthorized {
            keepReviewId(last, reviewId: reviewId, keep: keepReviewIdOnFailure)
            gradeError = "Your session expired. Update your token in Settings, then retry."
        } catch {
            keepReviewId(last, reviewId: reviewId, keep: keepReviewIdOnFailure)
            gradeError = "Couldn't undo that. Try again."
        }
    }

    func keepReviewId(_ last: GradedCard, reviewId: String, keep: Bool) {
        guard keep else { return }

        lastGraded = GradedCard(card: last.card, grade: last.grade, reviewId: reviewId, requestId: last.requestId)
    }

    func restore(_ last: GradedCard) {
        lastGraded = nil
        reviewedCount = max(0, reviewedCount - 1)

        if last.card.phase == "new" {
            gradedNewCount = max(0, gradedNewCount - 1)
        } else {
            gradedOtherCount = max(0, gradedOtherCount - 1)
        }

        queue.removeAll { $0.knowledgeBitId == last.card.knowledgeBitId }

        if let shown = current, shown.knowledgeBitId != last.card.knowledgeBitId {
            queue.insert(shown, at: 0)
        }

        noCardsYet = false
        isOffline = false
        present(last.card)
    }
}
