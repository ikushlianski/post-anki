import PostAnkiAPI
import SwiftUI

extension FocusTriageModel {
    var sourcesWithoutPending: [PendingReviewSource] {
        guard !pendingDecisions.isEmpty else { return list.sources }

        return list.sources.compactMap { source in
            let bits = source.bits.filter { pendingDecisions[$0.id] == nil }

            return bits.isEmpty ? nil : source.withBits(bits)
        }
    }

    func settlePending() async {
        for task in Array(pendingDecisions.values) { await task.value }
    }

    func decide(_ decision: PendingReviewDecision) async {
        guard let bit = current, !list.inFlight.contains(bit.id), pendingDecisions[bit.id] == nil else { return }

        let bitId = bit.id
        let rawNote = notes[bitId] ?? ""
        let note = FocusTriageNote.trimmed(rawNote)
        let snapshot = list.snapshot(of: bitId)
        let entry = FocusTriageDecisionEntry(
            bitId: bitId,
            verdict: decision == .approve ? .approved : .rejected,
            removed: snapshot,
            note: note,
            dwellMs: dwellMs(for: bitId)
        )

        list.rowMessages[bitId] = nil
        notice = nil
        undoMessage = nil
        log.record(entry)
        pendingDecisions[bitId] = Task { [weak self] in
            await self?.saveDecision(decision, entry: entry, rawNote: rawNote)
        }
        list.remove(bitId: bitId)
        list.counts.adjust(by: -1)
        notes[bitId] = nil
        syncPin()
        onDecisionsChanged?()
        onDecided?(entry)
    }

    private func saveDecision(_ decision: PendingReviewDecision, entry: FocusTriageDecisionEntry, rawNote: String) async {
        let bitId = entry.bitId
        var feedbackId: String?
        let outcome: PendingReviewDecisionOutcome

        do {
            switch decision {
            case .approve: try await APIClient.approveKnowledgeBit(id: bitId)
            case .reject: feedbackId = try await APIClient.rejectKnowledgeBit(id: bitId)
            }

            outcome = .removed
        } catch {
            outcome = decision.outcome(for: error)
        }

        switch outcome {
        case .removed:
            list.remove(bitId: bitId)

            if let note = entry.note { await sendNote(note, decision: decision, bitId: bitId, feedbackId: feedbackId) }

            pendingDecisions[bitId] = nil
        case .removedElsewhere:
            pendingDecisions[bitId] = nil
            log.remove(bitId: bitId)
            list.remove(bitId: bitId)
            notes[bitId] = nil
            notice = "That item was already decided elsewhere, so it was removed."
            syncPin()
            Task { await list.counts.refresh() }
            onDecisionsChanged?()
            onUndone?(bitId)
        case .kept(let message):
            pendingDecisions[bitId] = nil
            log.remove(bitId: bitId)

            if let removed = entry.removed { list.applyRestore(removed) }

            notes[bitId] = rawNote
            pinnedBitId = bitId

            if !message.isEmpty { list.rowMessages[bitId] = message }

            syncPin()
            notice = "Couldn't save that decision. The card is back in the queue."
            onDecisionsChanged?()
            onUndone?(bitId)
        }
    }

    private func sendNote(_ note: String, decision: PendingReviewDecision, bitId: String, feedbackId: String?) async {
        do {
            switch decision {
            case .approve:
                try await APIClient.gradeKnowledgeBit(id: bitId, rating: 3, note: note)
            case .reject:
                guard let feedbackId else { throw APIError.badStatus(404, nil) }

                try await APIClient.updateKnowledgeBitFeedbackNote(id: feedbackId, note: note)
            }
        } catch is CancellationError {
            return
        } catch {
            notice = "Couldn't save your note."
        }
    }
}
