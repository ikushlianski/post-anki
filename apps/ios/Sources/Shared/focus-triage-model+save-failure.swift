import PostAnkiAPI
import SwiftUI

extension FocusTriageModel {
    func applySettled(_ items: [SettledDecision]) {
        for item in items {
            let bitId = item.entry.bitId
            let pending = unsent.removeValue(forKey: bitId)

            queuedIds[bitId] = nil

            switch item.result {
            case .sent(_, let dropped):
                list.remove(bitId: bitId)

                if !dropped.isEmpty { log.setDropped(bitId: bitId, ids: dropped) }

                if let pending { onDecided?(pending.entry) }

                if item.noteFailed { notice = "Couldn't save your note." }
            case .stale:
                log.remove(bitId: bitId)
                list.remove(bitId: bitId)
                notes[bitId] = nil
                notice = "That item was already decided elsewhere, so it was removed."
                Task { await list.counts.refresh() }
                onDecisionsChanged?()
            }
        }

        syncPin()
    }

    func handleFailure(_ failure: SaveFailure) {
        guard saveFailure?.id != failure.id else { return }

        queuedIds[failure.bitId] = nil

        if let pending = unsent[failure.bitId] {
            log.remove(bitId: failure.bitId)

            if let removed = pending.entry.removed { list.applyRestore(removed) }

            notes[failure.bitId] = pending.rawNote
            pinnedBitId = failure.bitId
        }

        saveFailure = failure
        syncPin()
        onDecisionsChanged?()
    }

    func retryFailedSave() async {
        guard let failure = saveFailure else { return }

        saveFailure = nil
        queuedIds[failure.bitId] = failure.id
        list.remove(bitId: failure.bitId)

        if let pending = unsent[failure.bitId] {
            log.record(pending.entry)
            list.counts.adjust(by: -1)
            notes[failure.bitId] = nil
        }

        syncPin()
        onDecisionsChanged?()
        await decisionQueue.retryFailed()
        drainer.start()
    }

    func skipFailedSave() async {
        guard let failure = saveFailure else { return }

        await decisionQueue.skipFailed()
        unsent[failure.bitId] = nil
        saveFailure = nil
        drainer.start()
    }

    func undoQueued(_ entry: FocusTriageDecisionEntry) async -> Bool {
        guard let id = queuedIds[entry.bitId], !id.isEmpty else { return false }

        var removal = await decisionQueue.remove(id: id)

        if removal == .inFlight {
            await drainer.settle()

            guard log.lastDecided?.bitId == entry.bitId else { return true }

            removal = await decisionQueue.remove(id: id)
        }

        guard removal == .removed else { return false }

        let rawNote = unsent[entry.bitId]?.rawNote ?? ""

        queuedIds[entry.bitId] = nil
        unsent[entry.bitId] = nil
        log.remove(bitId: entry.bitId)
        undoMessage = nil
        notice = nil

        if let removed = entry.removed {
            list.applyRestore(removed)
            pinnedBitId = removed.bit.id
        }

        notes[entry.bitId] = rawNote
        syncPin()
        onDecisionsChanged?()
        onUndone?(entry.bitId)

        return true
    }
}
