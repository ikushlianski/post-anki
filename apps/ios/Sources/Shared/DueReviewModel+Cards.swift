import Foundation
import PostAnkiAPI

extension DueReviewModel {
    var buriesSiblings: Bool { scope?.knowledgeBitId == nil }

    func makeInput(for card: ReviewCard, grade: ReviewGrade) -> RecordReviewInput {
        RecordReviewInput(
            variantId: card.variantId,
            grade: grade,
            durationMs: Self.durationMs(elapsed: shownAt.duration(to: ContinuousClock.now)),
            requestId: cardRequestId,
            tz: TimeZone.current.identifier,
            burySiblings: card.isRehearsal || buriesSiblings ? nil : false,
            rehearsal: card.isRehearsal ? true : nil
        )
    }

    func visibleCards(
        _ cards: [ReviewCard],
        extraBitIds: Set<String> = [],
        extraVariantIds: Set<String> = []
    ) async -> [ReviewCard] {
        let pendingBits = await gradeQueue.pendingKnowledgeBitIds().union(extraBitIds)
        let pendingVariants = await gradeQueue.pendingVariantIds().union(extraVariantIds)
        let buries = buriesSiblings

        return cards.filter {
            !skippedVariantIds.contains($0.variantId) && !easyGradedVariantIds.contains($0.variantId) && !isSettled($0) && !Self.isHeldBack(
                $0,
                pendingBits: pendingBits,
                pendingVariants: pendingVariants,
                buriesSiblings: buries
            )
        }
    }

    func removeFromQueue(afterGrading card: ReviewCard, buriedVariantIds: [String]?) {
        guard let buriedVariantIds else {
            queue.removeAll { $0.knowledgeBitId == card.knowledgeBitId && !$0.isRehearsal }

            return
        }

        let removed = Set(buriedVariantIds + [card.variantId])

        queue.removeAll { removed.contains($0.variantId) }
    }

    nonisolated static func isHeldBack(
        _ card: ReviewCard,
        pendingBits: Set<String>,
        pendingVariants: Set<String>,
        buriesSiblings: Bool
    ) -> Bool {
        if pendingVariants.contains(card.variantId) { return true }

        guard pendingBits.contains(card.knowledgeBitId) else { return false }

        return !card.isIndependentCard || buriesSiblings
    }
}

extension DueReviewModel {
    func applyFollowUps(_ attempted: Set<String>) async {
        guard !attempted.isEmpty else { return }

        let followUps = await gradeQueue.takeFollowUps()

        followUpEligible.subtract(attempted)

        for requestId in attempted.sorted() {
            guard let followUp = followUps[requestId] else { continue }

            insertFollowUp(followUp.asRehearsal)
        }
    }

    func insertFollowUp(_ card: ReviewCard) {
        guard current?.variantId != card.variantId, !queue.contains(where: { $0.variantId == card.variantId }) else {
            return
        }

        guard current != nil else {
            present(card)

            return
        }

        queue.insert(card, at: 0)
    }
}
