import Foundation

extension DueReviewModel {
    func shuffleRemaining() {
        guard !isGrading, state == .card, queue.count > 1 else { return }

        isShuffled = true
        queue = ReviewQueueShuffle.shuffled(queue)
    }
}
