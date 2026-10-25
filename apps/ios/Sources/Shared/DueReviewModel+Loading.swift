import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func refreshAfterBackgroundFlush() async {
        pendingCount = await gradeQueue.count()

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

        if hasLoaded, !isGrading, isErrorState || isOffline {
            await load()
        }
    }

    func load() async {
        hasLoaded = true
        isOffline = false
        state = .loading

        do {
            let response = try await APIClient.reviewCards(
                tz: TimeZone.current.identifier,
                subjectId: scope?.subjectId,
                tagId: scope?.tagId,
                topicId: scope?.topicId,
                knowledgeBitId: scope?.knowledgeBitId
            )
            let pendingBits = await gradeQueue.pendingKnowledgeBitIds()
            let cards = response.cards.filter {
                !skippedVariantIds.contains($0.variantId) && !pendingBits.contains($0.knowledgeBitId)
            }
            let counts = response.counts

            serverCounts = ReviewRemainingCounts(counts)
            gradedNewCount = 0
            gradedOtherCount = 0

            nextDueAt = response.nextDueAt
            noCardsYet = response.nextDueAt == nil
                && counts.new == 0 && counts.learning == 0 && counts.review == 0
                && reviewedCount == 0
            queue = cards
            pendingCount = await gradeQueue.count()

            guard !queue.isEmpty else {
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
