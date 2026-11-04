import SwiftUI

#if os(iOS)
extension FocusTriageView {
    var keysActive: Bool {
        !isQueueEmpty && editingBit == nil && triage.overwritePromptBitId == nil && triage.saveFailure == nil
    }

    func handleKey(_ intent: FocusTriageKeyIntent) {
        guard keysActive, departing == nil, let bit = triage.current else { return }

        switch intent {
        case .choose(let index): triage.choose(index, in: bit)
        case .edit: editingBit = bit
        case .move(let offset): triage.moveChoice(by: offset)
        case .undo: if triage.canUndo, !triage.isBusy { Task { await triage.undo() } }
        case .approve, .reject:
            guard !triage.isBusy else { return }

            Task { if await decide(bit, source: triage.currentSource, approve: intent == .approve) { finishDeparture() } }
        }
    }
}
#endif
