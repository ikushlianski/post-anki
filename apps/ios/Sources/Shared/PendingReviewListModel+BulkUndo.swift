import PostAnkiAPI
import SwiftUI

extension PendingReviewListModel {
    func approveAll(sourceId: String) async {
        guard !bulkInFlight.contains(sourceId),
              let source = sources.first(where: { $0.id == sourceId }) else { return }

        let ids = source.bits.filter { !$0.variants.isEmpty && !inFlight.contains($0.id) }.map(\.id)

        guard !ids.isEmpty else { return }

        inFlight.formUnion(ids)
        bulkInFlight.insert(sourceId)
        sourceMessages[sourceId] = nil
        defer {
            inFlight.subtract(ids)
            bulkInFlight.remove(sourceId)
        }

        var approved: [String] = []
        var skipped: [PendingReviewBulkSkip] = []
        var failure: Error?

        for start in stride(from: 0, to: ids.count, by: 200) {
            let chunk = Array(ids[start..<min(start + 200, ids.count)])

            do {
                let result = try await APIClient.approveKnowledgeBits(ids: chunk)

                approved += result.approved
                skipped += result.skipped
                apply(result)
            } catch {
                failure = error

                break
            }
        }

        let gone = skipped.filter { $0.reason == "already_decided" || $0.reason == "not_found" }

        if !approved.isEmpty { counts.adjust(by: -approved.count) }

        if !gone.isEmpty { Task { await counts.refresh() } }

        if let failure {
            if approved.isEmpty {
                sourceMessages[sourceId] = PendingReviewDecision.bulkErrorMessage(for: failure)
            } else if PendingReviewDecision.bulkErrorMessage(for: failure) != nil {
                sourceMessages[sourceId] = "Approved \(approved.count) of \(ids.count). Couldn't finish, try again."
            }
        } else {
            sourceMessages[sourceId] = PendingReviewBulkApprovalResult(approved: approved, skipped: skipped).summary()
        }
    }

    func undoReject() async {
        guard let undo = pendingUndo, !undo.isRestoring, undo.canRetry else { return }

        let removed = undo.removed

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
            pendingFeedback = nil
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

    private func apply(_ result: PendingReviewBulkApprovalResult) {
        var gone = Set(result.approved)

        for skip in result.skipped {
            switch skip.reason {
            case "already_decided", "not_found":
                gone.insert(skip.id)
            case "no_variant":
                rowMessages[skip.id] = "This item has no questions yet, so it can't be approved."
            default:
                break
            }
        }

        withAnimation { remove(bitIds: gone) }
    }

    private func applyRestore(_ removed: PendingReviewRemovedBit) {
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
