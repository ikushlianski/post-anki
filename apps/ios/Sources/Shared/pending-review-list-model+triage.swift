import PostAnkiAPI
import SwiftUI

struct PendingReviewKeptUndo {
    let removed: PendingReviewRemovedBit
    let restoreVariantIds: [String]
}

extension PendingReviewListModel {
    func undoKeep() async -> PendingReviewTriageUndoOutcome? {
        guard let undo = keptUndo else { return nil }

        let bitId = undo.removed.bit.id
        let outcome: PendingReviewTriageUndoOutcome

        do {
            try await APIClient.undoTriageKnowledgeBit(id: bitId, restoreVariantIds: undo.restoreVariantIds)
            outcome = .restored
        } catch {
            outcome = PendingReviewTriageUndoOutcome.outcome(for: error)
        }

        switch outcome {
        case .restored:
            keptUndo = nil
            applyRestore(undo.removed)
        case .unavailable:
            keptUndo = nil
            Task { await counts.refresh() }
        case .retryable:
            break
        }

        return outcome
    }
}
