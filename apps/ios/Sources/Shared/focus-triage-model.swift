import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class FocusTriageModel {
    let list: PendingReviewListModel
    var pinnedBitId: String?
    var notes: [String: String] = [:]
    var log = FocusTriageDecisionLog()
    var notice: String?
    var undoMessage: String?
    var isUndoing = false
    var isPolling = false
    var pollAttempts = 0

    @ObservationIgnored var onDecisionsChanged: (() -> Void)?
    @ObservationIgnored var pollTask: Task<Void, Never>?
    @ObservationIgnored let pollInterval: Duration

    init(list: PendingReviewListModel, pollInterval: Duration = FocusTriagePollPlan.interval) {
        self.list = list
        self.pollInterval = pollInterval
    }

    var queue: FocusTriageQueue {
        FocusTriageQueue.build(sources: list.sources, pinnedBitId: pinnedBitId)
    }

    var current: PendingReviewBit? { queue.current }
    var currentSource: PendingReviewSource? { queue.currentSource }
    var readyCount: Int { queue.readyCount }
    var waitingCount: Int { queue.waitingCount }
    var canUndo: Bool { log.lastDecided != nil && !isUndoing }

    var isBusy: Bool {
        guard let id = current?.id else { return false }

        return list.inFlight.contains(id)
    }

    var message: String? {
        guard let id = current?.id else { return nil }

        return list.rowMessages[id]
    }

    func syncPin() {
        pinnedBitId = queue.current?.id
    }

    func load() async {
        await list.load()
        syncPin()
    }

    func approve() async { await decide(.approve) }

    func reject() async { await decide(.reject) }

    private func decide(_ decision: PendingReviewDecision) async {
        guard let bit = current, !list.inFlight.contains(bit.id) else { return }

        let bitId = bit.id
        let note = FocusTriageNote.trimmed(notes[bitId] ?? "")
        let snapshot = list.snapshot(of: bitId)

        list.inFlight.insert(bitId)
        list.rowMessages[bitId] = nil
        notice = nil
        undoMessage = nil
        defer { list.inFlight.remove(bitId) }

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
            log.record(FocusTriageDecisionEntry(
                bitId: bitId,
                verdict: decision == .approve ? .approved : .rejected,
                removed: snapshot
            ))
            list.remove(bitId: bitId)
            list.counts.adjust(by: -1)
            notes[bitId] = nil
            syncPin()
            onDecisionsChanged?()

            if let note { await sendNote(note, decision: decision, bitId: bitId, feedbackId: feedbackId) }
        case .removedElsewhere:
            list.remove(bitId: bitId)
            notes[bitId] = nil
            notice = "That item was already decided elsewhere, so it was removed."
            syncPin()
            Task { await list.counts.refresh() }
        case .kept(let message):
            if !message.isEmpty { list.rowMessages[bitId] = message }
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

    func undo() async {
        guard let entry = log.lastDecided, !isUndoing else { return }

        isUndoing = true
        undoMessage = nil
        notice = nil
        defer { isUndoing = false }

        let outcome: PendingReviewRestoreOutcome

        do {
            try await APIClient.restoreKnowledgeBit(id: entry.bitId)
            outcome = .restored
        } catch {
            outcome = Self.restoreOutcome(for: error)
        }

        switch outcome {
        case .restored:
            log.remove(bitId: entry.bitId)

            if let removed = entry.removed {
                list.applyRestore(removed)
                pinnedBitId = removed.bit.id
            } else {
                await load()
            }

            syncPin()
            onDecisionsChanged?()
        case .alreadyChanged:
            log.remove(bitId: entry.bitId)
            undoMessage = "Couldn't undo. That item was already changed."
            Task { await list.counts.refresh() }
            onDecisionsChanged?()
        case .retryable(let message), .fatal(let message):
            undoMessage = message
        case .cancelled:
            break
        }
    }

    private static func restoreOutcome(for error: Error) -> PendingReviewRestoreOutcome {
        if case APIError.badStatus(409, _) = error { return .alreadyChanged }

        return PendingReviewRestoreOutcome.restoreOutcome(for: error)
    }
}

extension FocusTriageModel {
    func startPolling() {
        guard pollTask == nil, FocusTriagePollPlan.shouldPoll(waiting: waitingCount, attempts: 0) else { return }

        pollAttempts = 0
        isPolling = true
        pollTask = Task { [weak self] in
            await self?.pollLoop()
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        isPolling = false
    }

    private func pollLoop() async {
        while FocusTriagePollPlan.shouldPoll(waiting: waitingCount, attempts: pollAttempts) {
            try? await Task.sleep(for: pollInterval)

            guard !Task.isCancelled else { return }

            let messages = list.rowMessages

            await list.load()

            for (id, text) in messages where list.sources.contains(where: { $0.bits.contains { $0.id == id } }) {
                list.rowMessages[id] = text
            }

            syncPin()
            pollAttempts += 1
        }

        pollTask = nil
        isPolling = false
    }
}
