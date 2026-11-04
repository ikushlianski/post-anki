import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func refreshAfterBackgroundFlush() async {
        pendingCount = await gradeQueue.count()
        await syncSaveFailure()

        if hasLoaded, !isGrading, isErrorState || isOffline {
            await load()
        }
    }

    func loadIfNeeded() async {
        guard !hasLoaded else { return }

        await flushPending()

        await load()
    }

    func flushPending() async {
        await gradeQueue.flush()
        pendingCount = await gradeQueue.count()
        await syncSaveFailure()

        if hasLoaded, !isGrading, isErrorState || isOffline {
            await load()
        }
    }

    func load() async {
        hasLoaded = true
        resetWindow()
        isOffline = false
        state = .loading
        refreshDailyGoalInBackground()

        do {
            let response = try await APIClient.reviewCards(
                limit: ReviewCardWindow.target,
                tz: TimeZone.current.identifier,
                subjectId: scope?.subjectId,
                tagId: scope?.tagId,
                topicId: scope?.topicId,
                knowledgeBitId: scope?.knowledgeBitId,
                aheadDays: aheadDays
            )
            let pendingBits = await gradeQueue.pendingKnowledgeBitIds()
            let pendingVariants = await gradeQueue.pendingVariantIds()
            let buries = buriesSiblings
            let cards = response.cards.filter {
                !skippedVariantIds.contains($0.variantId) && !easyGradedVariantIds.contains($0.variantId) && !isSettled($0) && !Self.isHeldBack(
                    $0,
                    pendingBits: pendingBits,
                    pendingVariants: pendingVariants,
                    buriesSiblings: buries
                )
            }
            let counts = response.counts

            windowExhausted = response.cards.count < ReviewCardWindow.target

            serverCounts = ReviewRemainingCounts(counts)

            if scope == nil { Task { await DueBadge.updater.update(due: DueBadge.dueTotal(counts)) } }

            gradedNewCount = 0
            gradedOtherCount = 0

            nextDueAt = response.nextDueAt
            dailyLimit = DailyReviewLimit(response, aheadDays: aheadDays)
            noCardsYet = response.nextDueAt == nil
                && counts.new == 0 && counts.learning == 0 && counts.review == 0
                && reviewedCount == 0
            queue = cards
            pendingCount = await gradeQueue.count()

            let scopedDone = scope != nil && reviewedCount > 0 && response.nextDueAt != nil
                && counts.new == 0 && counts.learning == 0 && counts.review == 0

            guard !queue.isEmpty, !scopedDone else {
                queue = []
                current = nil
                state = .empty
                return
            }

            present(queue.removeFirst())
        } catch is CancellationError {
            hasLoaded = false
            return
        } catch let error as URLError where error.code == .cancelled {
            hasLoaded = false
            return
        } catch APIError.unauthorized {
            state = .unauthorized
        } catch {
            pendingCount = await gradeQueue.count()

            if error is URLError, pendingCount > 0 {
                current = nil
                isOffline = true
                state = .empty
            } else {
                state = .error("Couldn't load your cards. Check your connection and try again.")
            }
        }
    }
}
