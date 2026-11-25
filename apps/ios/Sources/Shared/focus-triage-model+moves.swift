import PostAnkiAPI
import SwiftUI

extension FocusTriageModel {
    func moveCurrent(
        _ kind: FocusTriageExtraUndo.Kind,
        doing: String,
        call: @escaping @MainActor (String) async throws -> Void
    ) -> Bool {
        guard let bit = current, !isBusy, queuedIds[bit.id] == nil else { return false }

        let bitId = bit.id
        let snapshot = list.snapshot(of: bitId)
        let rawNote = notes[bitId] ?? ""
        let extra = FocusTriageExtraUndo(bitId: bitId, kind: kind, afterDecisionBitId: log.lastDecided?.bitId)

        list.rowMessages[bitId] = nil
        notice = nil
        undoMessage = nil
        pendingMoves[bitId] = kind
        list.remove(bitId: bitId)
        list.counts.adjust(by: -1)
        adjustDestinationCount(kind, by: 1)
        notes[bitId] = nil
        extras.append(extra)
        movedSnapshots[bitId] = snapshot
        syncPin()

        let previous = moveTails[bitId]

        moveTails[bitId] = Task { [weak self] in
            await previous?.value

            guard let self else { return }

            do {
                try await call(bitId)
                pendingMoves[bitId] = nil
                list.remove(bitId: bitId)
                syncPin()
            } catch {
                failMove(extra, snapshot: snapshot, rawNote: rawNote, error: error, doing: doing)
            }
        }

        return true
    }

    func settleMoves() async {
        for task in Array(moveTails.values) { await task.value }
    }

    private func adjustDestinationCount(_ kind: FocusTriageExtraUndo.Kind, by delta: Int) {
        switch kind {
        case .inbox: list.counts.adjustInbox(by: delta)
        case .chat: ChatQueueCountStore.shared.adjust(by: delta)
        case .example: break
        }
    }

    private func failMove(
        _ extra: FocusTriageExtraUndo,
        snapshot: PendingReviewRemovedBit?,
        rawNote: String,
        error: Error,
        doing: String
    ) {
        let bitId = extra.bitId

        pendingMoves[bitId] = nil
        extras.removeAll { $0 == extra }
        movedSnapshots[bitId] = nil
        adjustDestinationCount(extra.kind, by: -1)

        switch Self.moveOutcome(for: error, doing: doing) {
        case .removedElsewhere:
            list.remove(bitId: bitId)
            notice = "That item was already decided elsewhere, so it was removed."
            Task { await list.counts.refresh() }
        case .kept(let message):
            notes[bitId] = rawNote
            list.rowMessages[bitId] = message
            notice = "A card couldn't be sent and is back in the queue."

            if let snapshot {
                list.applyRestore(snapshot)
            } else {
                Task { await load() }
            }
        }

        syncPin()
    }

    private static func moveOutcome(for error: Error, doing: String) -> InboxMoveOutcome {
        if case APIError.badStatus(let status, let code) = error,
           (status == 409 && code == "blocked") || (status == 404 && code == "not_found") {
            return .removedElsewhere
        }

        return .kept(message: InboxMessages.message(for: error, doing: doing))
    }
}
