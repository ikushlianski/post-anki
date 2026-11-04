import PostAnkiAPI
import SwiftUI

extension FocusTriageModel {
    var sentToInboxCount: Int {
        extras.filter { $0.kind == .inbox }.count
    }

    var currentExampleLabel: String {
        current?.hasAiExample == true ? TriageActionName.newExample : TriageActionName.example
    }

    var exampleLimitReached: Bool {
        guard let id = current?.id else { return false }

        return exampleGenerationsLeft[id] == 0
    }

    func isWritingExample(_ bitId: String) -> Bool { exampleBusy.contains(bitId) }

    var movedRows: [FocusTriageDecisionRow] {
        extras.compactMap { extra in
            let kind: FocusTriageRowKind

            switch extra.kind {
            case .inbox: kind = .inbox
            case .chat: kind = .chat
            case .example: return nil
            }

            return FocusTriageDecisionRow(
                bitId: extra.bitId,
                kind: kind,
                title: movedSnapshots[extra.bitId].map { FocusTriageDecisionEntry.frontText(of: $0.bit) } ?? "Card",
                note: "",
                reason: nil
            )
        }
    }

    var sentToChatCount: Int {
        extras.filter { $0.kind == .chat }.count
    }

    @discardableResult
    func sendToInbox() async -> Bool {
        await moveCurrent(.inbox, doing: "send this to the Inbox") { id in
            let inboxCount = try await APIClient.moveKnowledgeBitToInbox(id: id)

            list.counts.setInbox(inboxCount)
        }
    }

    @discardableResult
    func sendToChat() async -> Bool {
        await moveCurrent(.chat, doing: "send this to Chat") { id in
            try await APIClient.moveToChatQueue(id: id)
            ChatQueueCountStore.shared.adjust(by: 1)
        }
    }

    private func moveCurrent(
        _ kind: FocusTriageExtraUndo.Kind,
        doing: String,
        call: (String) async throws -> Void
    ) async -> Bool {
        guard let bit = current, !isBusy, queuedIds[bit.id] == nil else { return false }

        let bitId = bit.id
        let snapshot = list.snapshot(of: bitId)
        let marker = log.lastDecided?.bitId

        list.inFlight.insert(bitId)
        list.rowMessages[bitId] = nil
        notice = nil
        undoMessage = nil
        defer { list.inFlight.remove(bitId) }

        do {
            try await call(bitId)

            list.remove(bitId: bitId)
            list.counts.adjust(by: -1)
            notes[bitId] = nil
            extras.append(FocusTriageExtraUndo(bitId: bitId, kind: kind, afterDecisionBitId: marker))
            movedSnapshots[bitId] = snapshot
            syncPin()

            return true
        } catch {
            switch Self.moveOutcome(for: error, doing: doing) {
            case .removedElsewhere:
                list.remove(bitId: bitId)
                notes[bitId] = nil
                notice = "That item was already decided elsewhere, so it was removed."
                syncPin()
                Task { await list.counts.refresh() }
            case .kept(let message):
                list.rowMessages[bitId] = message
            }

            return false
        }
    }

    private static func moveOutcome(for error: Error, doing: String) -> InboxMoveOutcome {
        if case APIError.badStatus(let status, let code) = error,
           (status == 409 && code == "blocked") || (status == 404 && code == "not_found") {
            return .removedElsewhere
        }

        return .kept(message: InboxMessages.message(for: error, doing: doing))
    }

    @discardableResult
    func generateExample(overwrite: Bool = false) async -> Bool {
        guard let bit = current, !isBusy, queuedIds[bit.id] == nil else { return false }

        let bitId = bit.id

        if bit.hasHumanExample && !overwrite {
            overwritePromptBitId = bitId

            return false
        }

        let marker = log.lastDecided?.bitId

        exampleBusy.insert(bitId)
        list.rowMessages[bitId] = nil
        notice = nil
        undoMessage = nil
        overwritePromptBitId = nil
        defer { exampleBusy.remove(bitId) }

        do {
            let result = try await APIClient.generateKnowledgeBitExample(id: bitId, overwrite: overwrite)

            list.setExample(bitId: bitId, example: result.example, aiGeneratedAt: result.exampleAiGeneratedAt)
            exampleGenerationsLeft[bitId] = result.generationsLeft
            extras.append(FocusTriageExtraUndo(
                bitId: bitId,
                kind: .example(text: result.example, previous: result.previousExample),
                afterDecisionBitId: marker
            ))

            return true
        } catch {
            switch KnowledgeBitExampleOutcome.outcome(for: error) {
            case .needsOverwriteConfirmation:
                overwritePromptBitId = bitId
            case .message(let message):
                list.rowMessages[bitId] = message

                if message.hasPrefix("You used all") { exampleGenerationsLeft[bitId] = 0 }
            case .cancelled:
                break
            }

            return false
        }
    }

    func undoExtra(_ extra: FocusTriageExtraUndo) async {
        isUndoing = true
        defer { isUndoing = false }

        undoMessage = nil
        notice = nil

        switch extra.kind {
        case .inbox:
            await undoMove(extra) {
                try await APIClient.returnKnowledgeBitFromInbox(id: extra.bitId)
                list.counts.adjustInbox(by: -1)
            }
        case .chat:
            await undoMove(extra) {
                try await APIClient.returnFromChatQueue(id: extra.bitId)
                ChatQueueCountStore.shared.adjust(by: -1)
            }
        case .example(let text, let previous):
            await undoExample(extra, text: text, previous: previous)
        }
    }

    private func undoMove(_ extra: FocusTriageExtraUndo, call: () async throws -> Void) async {
        let snapshot = movedSnapshots[extra.bitId]

        do {
            try await call()
        } catch {
            return handleUndoFailure(error, extra: extra)
        }

        extras.removeAll { $0 == extra }
        movedSnapshots[extra.bitId] = nil

        if let snapshot {
            list.applyRestore(snapshot)
            pinnedBitId = snapshot.bit.id
        } else {
            await load()
        }

        syncPin()
    }

    private func undoExample(_ extra: FocusTriageExtraUndo, text: String, previous: String?) async {
        guard let bit = list.bit(id: extra.bitId), bit.background == text else {
            extras.removeAll { $0 == extra }
            undoMessage = "Couldn't undo. The example was changed since."

            return
        }

        do {
            try await APIClient.editKnowledgeBit(id: extra.bitId, body: bit.body, background: previous)
        } catch {
            return handleUndoFailure(error, extra: extra)
        }

        extras.removeAll { $0 == extra }
        list.setExample(bitId: extra.bitId, example: previous, aiGeneratedAt: nil)
    }

    private func handleUndoFailure(_ error: Error, extra: FocusTriageExtraUndo) {
        switch PendingReviewRestoreOutcome.restoreOutcome(for: error) {
        case .alreadyChanged:
            extras.removeAll { $0 == extra }
            undoMessage = "Couldn't undo. That item was already changed."
            Task { await list.counts.refresh() }
        case .restored, .cancelled:
            break
        case .retryable(let message), .fatal(let message):
            undoMessage = message
        }
    }
}

extension PendingReviewListModel {
    func bit(id: String) -> PendingReviewBit? {
        sources.lazy.flatMap(\.bits).first { $0.id == id }
    }

    func setExample(bitId: String, example: String?, aiGeneratedAt: String?) {
        sources = sources.map { source in
            guard source.bits.contains(where: { $0.id == bitId }) else { return source }

            return source.withBits(source.bits.map {
                $0.id == bitId ? $0.withExample(example, aiGeneratedAt: aiGeneratedAt) : $0
            })
        }
    }
}
