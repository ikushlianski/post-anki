import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func resetWindow() {
        windowGeneration += 1
        topUpTask?.cancel()
        topUpTask = nil
        windowExhausted = false
    }

    func topUpIfNeeded() {
        guard ReviewCardWindow.needsTopUp(
            remaining: queue.count,
            exhausted: windowExhausted,
            inFlight: topUpTask != nil
        ) else { return }

        topUpTask = Task { [weak self] in await self?.topUp() }
    }

    private func topUp() async {
        let generation = windowGeneration
        defer {
            if generation == windowGeneration { topUpTask = nil }
        }

        guard let response = try? await APIClient.reviewCards(
            limit: ReviewCardWindow.topUpLimit,
            tz: TimeZone.current.identifier,
            subjectId: scope?.subjectId,
            tagId: scope?.tagId,
            topicId: scope?.topicId,
            knowledgeBitId: scope?.knowledgeBitId,
            aheadDays: aheadDays
        ), !Task.isCancelled, generation == windowGeneration else { return }

        let pendingBits = await gradeQueue.pendingKnowledgeBitIds()
        let pendingVariants = await gradeQueue.pendingVariantIds()

        guard generation == windowGeneration else { return }

        let buries = buriesSiblings
        if let limit = DailyReviewLimit(response, aheadDays: aheadDays) {
            dailyLimit = limit
            queue = []
            windowExhausted = true

            return
        }

        let before = queue.count
        queue = ReviewCardWindow.merge(
            held: queue,
            shown: current,
            incoming: response.cards,
            isComplete: response.cards.count < ReviewCardWindow.topUpLimit,
            buriesSiblings: buries,
            isBlocked: { [skippedVariantIds, easyGradedVariantIds, settledVariantIds, settledBitIds] card in
                skippedVariantIds.contains(card.variantId) || easyGradedVariantIds.contains(card.variantId) || Self.isSettled(
                    card,
                    settledVariantIds: settledVariantIds,
                    settledBitIds: settledBitIds
                ) || Self.isHeldBack(
                    card,
                    pendingBits: pendingBits,
                    pendingVariants: pendingVariants,
                    buriesSiblings: buries
                )
            }
        )

        if response.cards.count < ReviewCardWindow.topUpLimit || queue.count == before {
            windowExhausted = true
        }
    }

    func stopBackgroundWork() async {
        let tasks = [topUpTask, sendTask, retryTask]

        tasks.forEach { $0?.cancel() }

        for task in tasks { await task?.value }

        topUpTask = nil
        sendTask = nil
        retryTask = nil
    }

    func sendPendingInBackground() {
        guard sendTask == nil else {
            sendAgain = true

            return
        }

        sendTask = Task { [weak self] in await self?.drainPending() }
    }

    private func drainPending() async {
        repeat {
            sendAgain = false

            let attempted = followUpEligible

            await gradeQueue.flush()
            await applyFollowUps(attempted)
        } while sendAgain

        sendTask = nil
        pendingCount = await gradeQueue.count()
        await syncSaveFailure()

        if pendingCount == 0 {
            unsentCards = [:]
            refreshDailyGoalInBackground()
        } else if saveFailure == nil {
            scheduleRetry()
        }
    }

    private func scheduleRetry() {
        guard let retryDelay, retryTask == nil else { return }

        retryTask = Task { [weak self] in
            try? await Task.sleep(for: retryDelay)
            self?.retryTask = nil
            self?.sendPendingInBackground()
        }
    }
}
