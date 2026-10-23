import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class PendingReviewTriageModel {
    let list: PendingReviewListModel
    var currentId: String?
    var hint: String?
    private var selections: [String: PendingReviewTriageSelection] = [:]

    init(list: PendingReviewListModel) {
        self.list = list
    }

    var queue: [PendingReviewBit] { list.sources.flatMap(\.bits) }
    var remaining: Int { queue.count }

    var current: PendingReviewBit? {
        queue.first { $0.id == currentId } ?? queue.first
    }

    var currentSource: PendingReviewSource? {
        guard let id = current?.id else { return nil }

        return list.sources.first { $0.bits.contains { $0.id == id } }
    }

    var selection: PendingReviewTriageSelection {
        guard let bit = current else { return PendingReviewTriageSelection(variants: []) }

        return selections[bit.id] ?? PendingReviewTriageSelection(variants: bit.variants)
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

        switch action {
        case .toggle(let index): toggle(index)
        case .keep: await keep()
        case .drop: await drop()
        case .undo: await undo()
        case .skip: step(by: 1, wrapping: true)
        case .previous: step(by: -1, wrapping: false)
        case .next: step(by: 1, wrapping: false)
        case .edit: break
        }
    }

    func toggle(_ index: Int) {
        guard let bit = current else { return }

        var updated = selection

        updated.toggle(at: index)
        selections[bit.id] = updated
        hint = updated.hint
    }

    func keep() async {
        guard let bit = current, !isBusy, selection.canKeep else { return }

        let successor = neighbour(of: bit.id)
        let outcome = await list.triage(bitId: bit.id, keepVariantIds: selection.keepIds)

        if isKept(outcome) { return }

        currentId = successor
        selections[bit.id] = nil
    }

    func drop() async {
        guard let bit = current, !isBusy else { return }

        let successor = neighbour(of: bit.id)
        let outcome = await list.decide(.reject, bitId: bit.id)

        if case .kept = outcome { return }

        currentId = successor
        selections[bit.id] = nil
    }

    func undo() async {
        guard let undone = list.pendingUndo?.removed.bit.id else {
            hint = "Nothing to undo. Only a dropped piece can be undone, and only for a few seconds."

            return
        }

        await list.undoReject()

        if queue.contains(where: { $0.id == undone }) { currentId = undone }
    }

    private func isKept(_ outcome: PendingReviewTriageOutcome) -> Bool {
        if case .kept = outcome { return true }

        return false
    }

    private func neighbour(of id: String) -> String? {
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
