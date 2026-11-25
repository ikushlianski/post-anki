import Foundation
import PostAnkiAPI

extension DueReviewModel {
    @discardableResult
    func runInBackground(bitId: String, _ work: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let id = UUID()
        let previous = bitWriteTails[bitId]
        let task = Task { [weak self] in
            await previous?.value
            await work()
            self?.actionTasks[id] = nil
        }

        actionTasks[id] = task
        bitWriteTails[bitId] = task

        return task
    }

    func settleBackgroundActions() async {
        while let task = actionTasks.values.first { await task.value }
    }

    func reinsert(_ snapshot: AdvanceSnapshot) {
        let card = snapshot.card
        let held = Set(queue.map(\.variantId))
        let siblings = snapshot.queue.filter {
            $0.variantId != card.variantId
                && $0.knowledgeBitId == card.knowledgeBitId
                && !$0.isRehearsal
                && !held.contains($0.variantId)
                && $0.variantId != current?.variantId
        }
        var restored = [card] + siblings
        let ids = Set(restored.map(\.variantId))

        queue.removeAll { ids.contains($0.variantId) }
        skippedVariantIds.remove(card.variantId)

        if current == nil { present(restored.removeFirst()) }

        queue.insert(contentsOf: restored, at: 0)
    }

    func putBack(_ card: ReviewCard) {
        queue.removeAll { $0.variantId == card.variantId }
        skippedVariantIds.remove(card.variantId)

        if let shown = current, shown.variantId != card.variantId {
            queue.insert(shown, at: 0)
        }

        present(card)
    }

    func takeAway(_ card: ReviewCard) async {
        queue.removeAll { $0.variantId == card.variantId }

        if current?.variantId == card.variantId { await showNext() }
    }

    nonisolated static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }
}
