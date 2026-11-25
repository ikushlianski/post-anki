import PostAnkiAPI
import SwiftUI

extension PendingReviewListModel {
    func decide(_ decision: PendingReviewDecision, bitId: String) async -> PendingReviewDecisionOutcome {
        guard let snapshot = snapshot(of: bitId), !inFlight.contains(bitId), queuedIds[bitId] == nil else { return .kept(message: "") }

        if let message = await queueDecision(snapshot, kind: decision == .approve ? .approve : .reject) {
            return .kept(message: message)
        }

        if decision == .reject {
            withAnimation { pendingUndo = PendingReviewUndo(removed: snapshot) }
            scheduleUndoExpiry(after: 8)
        }

        return .removed
    }

    func triage(bitId: String, keepVariantIds: [String]) async -> PendingReviewTriageOutcome {
        guard let snapshot = snapshot(of: bitId), !inFlight.contains(bitId), queuedIds[bitId] == nil else { return .kept(message: "") }

        if let message = await queueDecision(snapshot, kind: .keep(keepVariantIds)) {
            return .kept(message: message)
        }

        dismissUndo()
        keptUndo = nil
        latestKeep = bitId

        return .removed
    }

    func queueDecision(_ snapshot: PendingReviewRemovedBit, kind: PendingDecision.Kind) async -> String? {
        let bitId = snapshot.bit.id

        queuedIds[bitId] = ""
        rowMessages[bitId] = nil
        notice = nil

        guard let id = await decisionQueue.enqueue(bitId: bitId, kind: kind, title: snapshot.bit.body) else {
            queuedIds[bitId] = nil

            let message = "Couldn't save that decision on this device. Try again."

            rowMessages[bitId] = message

            return message
        }

        queuedIds[bitId] = id
        unsent[bitId] = snapshot
        withAnimation { remove(bitId: bitId) }
        counts.adjust(by: -1)
        drainer.start()

        return nil
    }

    func settleDecisions() async {
        await drainer.settle()
        await skipTask?.value
    }

    func applyDecisions(_ items: [SettledDecision]) {
        for item in items {
            let bitId = item.entry.bitId
            let snapshot = unsent.removeValue(forKey: bitId)

            queuedIds[bitId] = nil

            switch item.result {
            case .sent(_, let dropped):
                withAnimation { remove(bitId: bitId) }

                if latestKeep == bitId, !dropped.isEmpty, let snapshot {
                    keptUndo = PendingReviewKeptUndo(removed: snapshot, restoreVariantIds: dropped)
                }
            case .stale:
                withAnimation { remove(bitId: bitId) }
                dismissUndo(for: bitId)
                notice = "That item was already decided elsewhere, so it was removed."
                Task { await counts.refresh() }
            }
        }
    }

    func handleDecisionFailure(_ failure: SaveFailure) {
        guard let snapshot = unsent.removeValue(forKey: failure.bitId) else { return }

        queuedIds[failure.bitId] = nil
        dismissUndo(for: failure.bitId)
        applyRestore(snapshot)
        rowMessages[failure.bitId] = failure.message
        skipTask = Task { [weak self] in
            guard let self else { return }

            await decisionQueue.skipFailed()
            drainer.start()
        }
    }

    func undoQueuedDecision(_ removed: PendingReviewRemovedBit) async -> Bool {
        let bitId = removed.bit.id

        guard let id = queuedIds[bitId], !id.isEmpty else { return false }

        guard await decisionQueue.remove(id: id) == .removed else {
            await drainer.settle()

            return false
        }

        queuedIds[bitId] = nil
        unsent[bitId] = nil
        applyRestore(removed)
        dismissUndo()

        return true
    }

    private func dismissUndo(for bitId: String) {
        if pendingUndo?.removed.bit.id == bitId { dismissUndo() }

        if keptUndo?.removed.bit.id == bitId { keptUndo = nil }
    }
}
