import PostAnkiAPI
import SwiftUI

extension PendingReviewTriageModel {
    func settlePending() async {
        await drainer.settle()
    }

    func enqueue(_ bit: PendingReviewBit, kind: PendingDecision.Kind) async {
        guard saveFailure == nil, !isBusy, queued[bit.id] == nil else { return }

        let bitId = bit.id
        let successor = neighbour(of: bitId)
        let snapshot = list.snapshot(of: bitId)

        queued[bitId] = ""

        guard let id = await decisionQueue.enqueue(bitId: bitId, kind: kind, title: bit.body) else {
            queued[bitId] = nil
            hint = "Couldn't save that decision on this device. Try again."

            return
        }

        queued[bitId] = id
        recorder.record(bitId: bitId, verdict: kind.verdict)
        unsent[bitId] = snapshot
        latestDecision = bitId
        list.rowMessages[bitId] = nil
        list.notice = nil
        list.keptUndo = nil
        list.dismissUndo()
        list.remove(bitId: bitId)
        list.counts.adjust(by: -1)
        currentId = successor
        clearSelection(of: bitId)

        if case .reject = kind, let snapshot {
            list.pendingUndo = PendingReviewUndo(removed: snapshot)
            list.scheduleUndoExpiry(after: 8)
        }

        drainer.start()
    }

    func applySettled(_ items: [SettledDecision]) {
        for item in items {
            let bitId = item.entry.bitId
            let snapshot = unsent.removeValue(forKey: bitId)

            queued[bitId] = nil

            switch item.result {
            case .sent(_, let dropped):
                list.remove(bitId: bitId)

                if latestDecision == bitId, !dropped.isEmpty, let snapshot {
                    list.keptUndo = PendingReviewKeptUndo(removed: snapshot, restoreVariantIds: dropped)
                }
            case .stale:
                list.remove(bitId: bitId)
                dismissUndo(for: bitId)
                list.notice = "That item was already decided elsewhere, so it was removed."
                Task { await list.counts.refresh() }
            }
        }
    }

    func handleFailure(_ failure: SaveFailure) {
        guard saveFailure?.id != failure.id else { return }

        queued[failure.bitId] = nil
        dismissUndo(for: failure.bitId)

        if let snapshot = unsent[failure.bitId] {
            list.applyRestore(snapshot)
            currentId = failure.bitId
        }

        saveFailure = failure
    }

    func retryFailedSave() async {
        guard let failure = saveFailure else { return }

        let successor = neighbour(of: failure.bitId)

        saveFailure = nil
        queued[failure.bitId] = failure.id

        if unsent[failure.bitId] != nil {
            currentId = successor
            list.counts.adjust(by: -1)
        }

        list.remove(bitId: failure.bitId)
        await decisionQueue.retryFailed()
        drainer.start()
    }

    func skipFailedSave() async {
        guard let failure = saveFailure else { return }

        await decisionQueue.skipFailed()
        recorder.undo(bitId: failure.bitId)
        unsent[failure.bitId] = nil
        saveFailure = nil
        drainer.start()
    }

    func undoQueued() async -> Bool {
        guard let bitId = list.keptUndo?.removed.bit.id ?? list.pendingUndo?.removed.bit.id,
              let id = queued[bitId], !id.isEmpty else { return false }

        var removal = await decisionQueue.remove(id: id)

        if removal == .inFlight {
            await drainer.settle()
            removal = queued[bitId] == nil ? .notFound : await decisionQueue.remove(id: id)
        }

        guard removal == .removed else { return false }

        queued[bitId] = nil
        recorder.undo(bitId: bitId)

        if let snapshot = unsent.removeValue(forKey: bitId) { list.applyRestore(snapshot) }

        list.dismissUndo()
        list.keptUndo = nil
        clearSelection(of: bitId)
        currentId = bitId

        return true
    }

    private func dismissUndo(for bitId: String) {
        if list.pendingUndo?.removed.bit.id == bitId { list.dismissUndo() }

        if list.keptUndo?.removed.bit.id == bitId { list.keptUndo = nil }
    }
}

extension PendingDecision.Kind {
    var verdict: TriageVerdict {
        switch self {
        case .approve, .keep: return .approved
        case .reject: return .rejected
        }
    }
}
