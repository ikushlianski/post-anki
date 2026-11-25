import PostAnkiAPI
import SwiftUI

extension PendingReviewListModel {
    func approveAll(sourceId: String) async {
        guard let source = sources.first(where: { $0.id == sourceId }) else { return }

        let ready = source.bits.filter { !$0.variants.isEmpty && !inFlight.contains($0.id) && queuedIds[$0.id] == nil }

        sourceMessages[sourceId] = nil

        for bit in ready {
            guard let snapshot = snapshot(of: bit.id) else { continue }

            _ = await queueDecision(snapshot, kind: .approve)
        }
    }

    func undoReject() async {
        guard let undo = pendingUndo, !undo.isRestoring, undo.canRetry else { return }

        let removed = undo.removed

        if await undoQueuedDecision(removed) { return }

        guard pendingUndo?.removed.bit.id == removed.bit.id else { return }

        pendingUndo?.isRestoring = true
        pendingUndo?.message = nil

        let outcome: PendingReviewRestoreOutcome

        do {
            try await APIClient.restoreKnowledgeBit(id: removed.bit.id)
            outcome = .restored
        } catch {
            outcome = PendingReviewRestoreOutcome.restoreOutcome(for: error)
        }

        guard pendingUndo?.removed.bit.id == removed.bit.id else {
            if case .restored = outcome { applyRestore(removed) }

            return
        }

        pendingUndo?.isRestoring = false

        switch outcome {
        case .restored:
            applyRestore(removed)
            dismissUndo()
        case .alreadyChanged:
            failUndo("Couldn't restore. It was already changed.")
            Task { await counts.refresh() }
            Task { await load() }
        case .retryable(let message):
            pendingUndo?.message = message
            scheduleUndoExpiry(after: 8)
        case .fatal(let message):
            failUndo(message)
        case .cancelled:
            scheduleUndoExpiry(after: 8)
        }
    }

    func dismissUndo() {
        undoTask?.cancel()
        undoTask = nil
        withAnimation { pendingUndo = nil }
    }

    func applyRestore(_ removed: PendingReviewRemovedBit) {
        removedDuringLoad.remove(removed.bit.id)
        restoredDuringLoad.append(removed)
        withAnimation { insert(removed) }
        counts.adjust(by: 1)
    }

    private func failUndo(_ message: String) {
        pendingUndo?.message = message
        pendingUndo?.canRetry = false
        scheduleUndoExpiry(after: 4)
    }

    func scheduleUndoExpiry(after seconds: Double) {
        undoTask?.cancel()

        guard let id = pendingUndo?.removed.bit.id else {
            undoTask = nil

            return
        }

        undoTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))

            guard !Task.isCancelled, let self else { return }

            guard let current = pendingUndo, current.removed.bit.id == id, !current.isRestoring else { return }

            dismissUndo()
        }
    }
}
