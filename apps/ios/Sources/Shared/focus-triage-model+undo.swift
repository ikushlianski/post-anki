import PostAnkiAPI
import SwiftUI

extension FocusTriageModel {
    func undoDecision() async {
        guard let entry = log.lastDecided else { return }

        isUndoing = true
        defer { isUndoing = false }

        if await undoQueued(entry) { return }

        guard log.lastDecided?.bitId == entry.bitId else { return }

        await beforeRestore?(entry.bitId)

        guard log.lastDecided?.bitId == entry.bitId else { return }

        undoMessage = nil
        notice = nil
        log.remove(bitId: entry.bitId)

        if let removed = entry.removed {
            list.applyRestore(removed)
            pinnedBitId = removed.bit.id
        }

        syncPin()
        onDecisionsChanged?()
        onUndone?(entry.bitId)
        sendRestore(entry)
    }

    func settleRestores() async {
        for task in Array(restoreTails.values) { await task.value }
    }

    private func sendRestore(_ entry: FocusTriageDecisionEntry) {
        let bitId = entry.bitId
        let previous = restoreTails[bitId]

        restoreTails[bitId] = Task { [weak self] in
            await previous?.value

            guard let self else { return }

            await performRestore(entry)
        }
    }

    private func performRestore(_ entry: FocusTriageDecisionEntry) async {
        let outcome: PendingReviewRestoreOutcome

        do {
            if entry.dropped.isEmpty {
                try await APIClient.restoreKnowledgeBit(id: entry.bitId)
            } else {
                try await APIClient.undoTriageKnowledgeBit(id: entry.bitId, restoreVariantIds: entry.dropped)
            }

            outcome = .restored
        } catch {
            outcome = Self.restoreOutcome(for: error)
        }

        switch outcome {
        case .restored:
            if entry.removed == nil { await load() }
        case .alreadyChanged:
            withdrawRestored(entry)
            undoMessage = "Couldn't undo. That item was already changed."
            Task { await list.counts.refresh() }
            onDecisionsChanged?()
        case .retryable(let message), .fatal(let message):
            withdrawRestored(entry)
            reinstate(entry)
            undoMessage = message
        case .cancelled:
            break
        }
    }

    private func withdrawRestored(_ entry: FocusTriageDecisionEntry) {
        guard entry.removed != nil, queuedIds[entry.bitId] == nil, !log.entries.contains(where: { $0.bitId == entry.bitId }) else { return }

        list.remove(bitId: entry.bitId)
        list.counts.adjust(by: -1)
        syncPin()
    }

    private func reinstate(_ entry: FocusTriageDecisionEntry) {
        guard !log.entries.contains(where: { $0.bitId == entry.bitId }) else { return }

        log.record(entry)
        onDecisionsChanged?()
        onDecided?(entry)
    }

    private static func restoreOutcome(for error: Error) -> PendingReviewRestoreOutcome {
        if case APIError.badStatus(409, _) = error { return .alreadyChanged }

        return PendingReviewRestoreOutcome.restoreOutcome(for: error)
    }
}
