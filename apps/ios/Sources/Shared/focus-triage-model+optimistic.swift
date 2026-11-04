import PostAnkiAPI
import SwiftUI

struct UnsentTriageDecision {
    let entry: FocusTriageDecisionEntry
    let rawNote: String
}

extension FocusTriageModel {
    var sourcesWithoutPending: [PendingReviewSource] {
        guard !queuedIds.isEmpty else { return list.sources }

        return list.sources.compactMap { source in
            let bits = source.bits.filter { queuedIds[$0.id] == nil }

            return bits.isEmpty ? nil : source.withBits(bits)
        }
    }

    func settlePending() async {
        await drainer.settle()
    }

    func decide(_ decision: PendingReviewDecision) async {
        guard saveFailure == nil, let bit = current, !list.inFlight.contains(bit.id), queuedIds[bit.id] == nil else { return }

        let bitId = bit.id
        let rawNote = notes[bitId] ?? ""
        let note = FocusTriageNote.trimmed(rawNote)
        let snapshot = list.snapshot(of: bitId)
        let parts = FocusTriageDecisionEntry.parts(of: bit)
        let entry = FocusTriageDecisionEntry(
            bitId: bitId,
            verdict: decision == .approve ? .approved : .rejected,
            removed: snapshot,
            context: parts.context,
            prompt: parts.prompt,
            note: note,
            dwellMs: dwellMs(for: bitId)
        )

        queuedIds[bitId] = ""

        guard let id = await decisionQueue.enqueue(
            bitId: bitId,
            kind: kind(for: decision, bit: bit),
            note: note,
            title: entry.front
        ) else {
            queuedIds[bitId] = nil
            notice = "Couldn't save that decision on this device. Try again."

            return
        }

        queuedIds[bitId] = id
        unsent[bitId] = UnsentTriageDecision(entry: entry, rawNote: rawNote)
        list.rowMessages[bitId] = nil
        notice = nil
        undoMessage = nil
        log.record(entry)
        list.remove(bitId: bitId)
        list.counts.adjust(by: -1)
        notes[bitId] = nil
        chosen[bitId] = nil
        syncPin()
        onDecisionsChanged?()
        drainer.start()
    }

    func chosenIndex(of bit: PendingReviewBit) -> Int {
        bit.variants.firstIndex { $0.id == chosen[bit.id] } ?? 0
    }

    func choose(_ index: Int, in bit: PendingReviewBit) {
        guard bit.offersSentenceChoice, bit.variants.indices.contains(index) else { return }

        chosen[bit.id] = bit.variants[index].id
    }

    func moveChoice(by offset: Int) {
        guard let bit = current, bit.offersSentenceChoice else { return }

        choose(min(max(chosenIndex(of: bit) + offset, 0), bit.variants.count - 1), in: bit)
    }

    private func kind(for decision: PendingReviewDecision, bit: PendingReviewBit) -> PendingDecision.Kind {
        guard decision == .approve else { return .reject }

        guard bit.offersSentenceChoice else { return .approve }

        return .keep([bit.variants[chosenIndex(of: bit)].id])
    }
}
