import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class FocusTriageModel {
    let list: PendingReviewListModel
    var pinnedBitId: String?
    var subjectFilter: String?
    var notes: [String: String] = [:]
    var log = FocusTriageDecisionLog()
    var notice: String?
    var undoMessage: String?
    var isUndoing = false
    var isPolling = false
    var pollAttempts = 0
    var extras: [FocusTriageExtraUndo] = []
    var exampleBusy: Set<String> = []
    var exampleGenerationsLeft: [String: Int] = [:]
    var overwritePromptBitId: String?
    var saveFailure: SaveFailure?
    var chosen: [String: String] = [:]

    @ObservationIgnored var onDecisionsChanged: (() -> Void)?
    @ObservationIgnored var onDecided: ((FocusTriageDecisionEntry) -> Void)?
    @ObservationIgnored var beforeRestore: ((String) async -> Void)?
    @ObservationIgnored var onUndone: ((String) -> Void)?
    @ObservationIgnored var movedSnapshots: [String: PendingReviewRemovedBit] = [:]
    @ObservationIgnored var shown: (bitId: String, at: Date)?
    @ObservationIgnored var pollTask: Task<Void, Never>?
    @ObservationIgnored var queuedIds: [String: String] = [:]
    @ObservationIgnored var unsent: [String: UnsentTriageDecision] = [:]
    @ObservationIgnored let decisionQueue: PendingDecisionQueue
    @ObservationIgnored let drainer: DecisionDrainer
    @ObservationIgnored let pollInterval: Duration

    init(
        list: PendingReviewListModel,
        decisionQueue: PendingDecisionQueue = .shared,
        pollInterval: Duration = FocusTriagePollPlan.interval
    ) {
        self.list = list
        self.decisionQueue = decisionQueue
        self.pollInterval = pollInterval
        drainer = DecisionDrainer(queue: decisionQueue)
        drainer.onSettled = { [weak self] in self?.applySettled($0) }
        drainer.onFailure = { [weak self] in self?.handleFailure($0) }
    }

    var queue: FocusTriageQueue {
        FocusTriageQueue.build(sources: sourcesWithoutPending, pinnedBitId: pinnedBitId, subjectId: subjectFilter)
    }

    var current: PendingReviewBit? { queue.current }
    var currentSource: PendingReviewSource? { queue.currentSource }
    var readyCount: Int { queue.readyCount }
    var remainingCount: Int {
        list.remainingTotal(ready: readyCount, loaded: readyCount + waitingCount, subjectId: subjectFilter)
    }
    var waitingCount: Int { queue.waitingCount }
    var canUndo: Bool { (log.lastDecided != nil || !extras.isEmpty) && !isUndoing }

    var isBusy: Bool {
        guard let id = current?.id else { return false }

        return list.inFlight.contains(id) || exampleBusy.contains(id)
    }

    var message: String? {
        guard let id = current?.id else { return nil }

        return list.rowMessages[id]
    }

    func syncPin() {
        pinnedBitId = queue.current?.id

        if let id = pinnedBitId, shown?.bitId != id {
            shown = (id, Date())
        } else if pinnedBitId == nil {
            shown = nil
        }

        list.topUpIfNeeded(remaining: queue.readyCount + queue.waitingCount, subjectId: subjectFilter)
    }

    func dwellMs(for bitId: String) -> Int? {
        guard let shown, shown.bitId == bitId else { return nil }

        return max(0, Int(Date().timeIntervalSince(shown.at) * 1000))
    }

    func load() async {
        for (bitId, id) in await decisionQueue.pendingIds() where queuedIds[bitId] == nil {
            queuedIds[bitId] = id
        }

        drainer.start()
        await list.load(limit: PendingReviewWindow.target, subjectId: subjectFilter)
        syncPin()
    }

    func approve() async { await decide(.approve) }

    func reject() async { await decide(.reject) }

    func undo() async {
        guard !isUndoing else { return }

        if let extra = extras.last, extra.isNext(lastDecidedBitId: log.lastDecided?.bitId, decidedBitIds: log.entries.map(\.bitId)) {
            return await undoExtra(extra)
        }

        await undoDecision()
    }

    private func undoDecision() async {
        guard let entry = log.lastDecided else { return }

        isUndoing = true
        defer { isUndoing = false }

        if await undoQueued(entry) { return }

        guard log.lastDecided?.bitId == entry.bitId else { return }

        await beforeRestore?(entry.bitId)

        guard log.lastDecided?.bitId == entry.bitId else { return }

        undoMessage = nil
        notice = nil

        let outcome: PendingReviewRestoreOutcome

        let dropped = log.lastDecided?.dropped ?? []

        do {
            if dropped.isEmpty {
                try await APIClient.restoreKnowledgeBit(id: entry.bitId)
            } else {
                try await APIClient.undoTriageKnowledgeBit(id: entry.bitId, restoreVariantIds: dropped)
            }

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
            onUndone?(entry.bitId)
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

            await list.load(limit: PendingReviewWindow.target, subjectId: subjectFilter)

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
