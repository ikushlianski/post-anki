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

        let input = RecordReviewInput(
            variantId: card.variantId,
            grade: grade,
            durationMs: Self.durationMs(elapsed: shownAt.duration(to: ContinuousClock.now)),
            requestId: cardRequestId
        )

        do {
            let result = try await submit(input)

            lastGraded = GradedCard(
                card: card,
                grade: grade,
                reviewId: result.reviewId,
                requestId: cardRequestId
            )
            reviewedCount += 1
            countGraded(card)
            await showNext()
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch is URLError {
            await queueOffline(input, card: card)
        } catch APIError.badStatus(let status, _) where status == 403 || status == 404 {
            skippedVariantIds.insert(card.variantId)
            notice = "Skipped a card that is no longer available"
            await showNext()
        } catch APIError.unauthorized {
            gradeError = "Your session expired. Update your token in Settings, then retry."
            failedGrade = grade
        } catch {
            gradeError = "Couldn't save that."
            failedGrade = grade
        }
    }

    func queueOffline(_ input: RecordReviewInput, card: ReviewCard) async {
        guard await gradeQueue.enqueue(input, knowledgeBitId: card.knowledgeBitId) else {
            gradeError = "Couldn't save that."
            failedGrade = input.grade

            return
        }

        lastGraded = GradedCard(card: card, grade: input.grade, reviewId: nil, requestId: cardRequestId)
        reviewedCount += 1
        countGraded(card)
        queue.removeAll { $0.knowledgeBitId == card.knowledgeBitId }
        pendingCount = await gradeQueue.count()
        await showNext()
        notice = "Saved offline, will send later"
    }

    func countGraded(_ card: ReviewCard) {
        if card.phase == "new" {
            gradedNewCount += 1
        } else {
            gradedOtherCount += 1
        }
    }

    func submit(_ input: RecordReviewInput) async throws -> RecordReviewResult {
        try await APIClient.recordReview(input)
    }
}
