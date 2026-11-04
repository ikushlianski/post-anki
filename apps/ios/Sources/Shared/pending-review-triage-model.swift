import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class PendingReviewTriageModel {
    let list: PendingReviewListModel
    var currentId: String?
    var hint: String?
    var saveFailure: SaveFailure?
    var subjectFilter: String?
    private var selections: [String: PendingReviewTriageSelection] = [:]

    @ObservationIgnored var queued: [String: String] = [:]
    @ObservationIgnored var unsent: [String: PendingReviewRemovedBit] = [:]
    @ObservationIgnored var latestDecision: String?
    @ObservationIgnored let decisionQueue: PendingDecisionQueue
    @ObservationIgnored let drainer: DecisionDrainer
    @ObservationIgnored let recorder: MacTriageSessionRecorder

    init(list: PendingReviewListModel, decisionQueue: PendingDecisionQueue = .shared, recorder: MacTriageSessionRecorder = MacTriageSessionRecorder()) {
        self.list = list
        self.recorder = recorder
        self.decisionQueue = decisionQueue
        drainer = DecisionDrainer(queue: decisionQueue)
        drainer.onSettled = { [weak self] in self?.applySettled($0) }
        drainer.onFailure = { [weak self] in self?.handleFailure($0) }
    }

    var queue: [PendingReviewBit] {
        FocusTriageSubject.filter(list.sources, subjectId: subjectFilter).flatMap(\.bits).filter { queued[$0.id] == nil }
    }
    var remaining: Int {
        let ready = queue.count
        let loaded = FocusTriageSubject.filter(list.sources, subjectId: subjectFilter).reduce(0) { $0 + $1.bits.count }

        return list.remainingTotal(ready: ready, loaded: loaded, subjectId: subjectFilter)
    }

    func setScope(_ subjectId: String?) async {
        subjectFilter = subjectId
        list.scopeSubjectId = subjectId
        await list.load()
        topUpIfNeeded()
    }

    func layoutChanged(toTriage: Bool) async {
        list.scopeSubjectId = toTriage ? subjectFilter : nil
        await list.load()
        topUpIfNeeded()
    }

    func topUpIfNeeded() {
        list.topUpIfNeeded(remaining: queue.count, subjectId: subjectFilter)
    }

    var current: PendingReviewBit? {
        queue.first { $0.id == currentId } ?? queue.first
    }

    var currentSource: PendingReviewSource? {
        guard let id = current?.id else { return nil }

        return list.sources.first { $0.bits.contains { $0.id == id } }
    }

    var selection: PendingReviewTriageSelection {
        guard let bit = current else { return PendingReviewTriageSelection(variants: []) }

        return selections[bit.id] ?? PendingReviewTriageSelection(variants: bit.variants, pickOne: bit.offersSentenceChoice)
    }

    var isBusy: Bool {
        guard let id = current?.id else { return false }

        return list.inFlight.contains(id)
    }

    var message: String? {
        guard let id = current?.id else { return nil }

        return list.rowMessages[id]
    }

    func perform(_ action: PendingReviewTriageAction) async {
        hint = nil
        defer { topUpIfNeeded() }

        switch action {
        case .toggle(let index): toggle(index)
        case .moveOption(let offset): moveOption(offset)
        case .keep: await keep()
        case .drop: await drop()
        case .undo: await undo()
        case .skip: step(by: 1, wrapping: true)
        case .previous: step(by: -1, wrapping: false)
        case .next: step(by: 1, wrapping: false)
        case .edit: break
        }
    }

    func clearSelection(of bitId: String) {
        selections[bitId] = nil
    }

    func toggle(_ index: Int) {
        guard let bit = current else { return }

        var updated = selection

        updated.toggle(at: index)
        selections[bit.id] = updated
        hint = updated.hint
    }

    func moveOption(_ offset: Int) {
        guard let bit = current, selection.pickOne else { return }

        var updated = selection

        updated.move(by: offset)
        selections[bit.id] = updated
    }

    func keep() async {
        guard let bit = current, selection.canKeep else { return }

        await enqueue(bit, kind: .keep(selection.keepIds))
    }

    func drop() async {
        guard let bit = current else { return }

        await enqueue(bit, kind: .reject)
    }

    func undo() async {
        if await undoQueued() { return }

        if let kept = list.keptUndo?.removed.bit.id {
            await undoKeep(of: kept)

            return
        }

        guard let undone = list.pendingUndo?.removed.bit.id else {
            hint = "Nothing to undo. A drop can be undone for a few seconds, the last keep until the next decision."

            return
        }

        await list.undoReject()
        recorder.undo(bitId: undone)

        if queue.contains(where: { $0.id == undone }) { currentId = undone }
    }

    private func undoKeep(of bitId: String) async {
        switch await list.undoKeep() {
        case .restored:
            recorder.undo(bitId: bitId)
            selections[bitId] = nil
            currentId = bitId
        case .unavailable(let message), .retryable(let message):
            hint = message
        case nil:
            break
        }
    }

    func neighbour(of id: String) -> String? {
        let ids = queue.map(\.id)

        guard let index = ids.firstIndex(of: id) else { return nil }

        if index + 1 < ids.count { return ids[index + 1] }

        return index > 0 ? ids[index - 1] : nil
    }

    private func step(by offset: Int, wrapping: Bool) {
        let ids = queue.map(\.id)

        guard !ids.isEmpty else { return }

        let index = ids.firstIndex(of: current?.id ?? "") ?? 0
        var target = index + offset

        if wrapping {
            target = (target + ids.count) % ids.count
        } else {
            target = min(max(target, 0), ids.count - 1)
        }

        currentId = ids[target]
    }
}
