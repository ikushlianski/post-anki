import Foundation
import PostAnkiAPI

struct AdvanceSnapshot {
    let card: ReviewCard
    let queue: [ReviewCard]
    let wasRevealed: Bool
    let shownAt: ContinuousClock.Instant
    let requestId: String
}

extension DueReviewModel {
    func advanceFirst(past card: ReviewCard, buriedVariantIds: [String]?) -> AdvanceSnapshot? {
        let before = queue

        removeFromQueue(afterGrading: card, buriedVariantIds: buriedVariantIds)

        guard !queue.isEmpty else {
            queue = before

            return nil
        }

        let snapshot = AdvanceSnapshot(
            card: card,
            queue: before,
            wasRevealed: isRevealed,
            shownAt: shownAt,
            requestId: cardRequestId
        )

        present(queue.removeFirst())

        return snapshot
    }

    func rollBack(_ snapshot: AdvanceSnapshot) {
        let known = Set(snapshot.queue.map(\.variantId))
        let added = queue.filter { !known.contains($0.variantId) && $0.variantId != snapshot.card.variantId }

        queue = snapshot.queue + added
        present(snapshot.card)
        isRevealed = snapshot.wasRevealed
        shownAt = snapshot.shownAt
        cardRequestId = snapshot.requestId
    }
}
