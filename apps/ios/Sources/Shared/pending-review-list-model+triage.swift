import PostAnkiAPI
import SwiftUI

extension PendingReviewListModel {
    func triage(bitId: String, keepVariantIds: [String]) async -> PendingReviewTriageOutcome {
        guard !inFlight.contains(bitId) else { return .kept(message: "") }

        inFlight.insert(bitId)
        rowMessages[bitId] = nil
        notice = nil
        defer { inFlight.remove(bitId) }

        let snapshot = snapshot(of: bitId)
        let outcome: PendingReviewTriageOutcome
        var dropped: [String] = []

        do {
            dropped = try await APIClient.triageKnowledgeBit(id: bitId, keepVariantIds: keepVariantIds)
            outcome = .removed
        } catch {
            outcome = PendingReviewTriageOutcome.outcome(for: error)
        }

        switch outcome {
        case .removed:
            withAnimation { remove(bitId: bitId) }
            counts.adjust(by: -1)
            dismissUndo()
            keptUndo = snapshot.flatMap { removed in
                dropped.isEmpty ? nil : PendingReviewKeptUndo(removed: removed, restoreVariantIds: dropped)
            }
        case .removedElsewhere:
            withAnimation { remove(bitId: bitId) }
            notice = "That item was already decided elsewhere, so it was removed."
            Task { await counts.refresh() }
        case .kept(let message):
            if !message.isEmpty { rowMessages[bitId] = message }
        }

        return outcome
    }
}

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
