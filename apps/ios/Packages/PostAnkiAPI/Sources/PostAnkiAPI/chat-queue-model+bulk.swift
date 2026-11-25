import Foundation

public enum ChatQueueBulkAction: Sendable, Equatable {
    case moveToInbox
    case delete
    case snooze(days: Int)

    var failureVerb: String {
        switch self {
        case .moveToInbox: "moved"
        case .snooze: "snoozed"
        case .delete: "deleted"
        }
    }

    var alwaysConfirms: Bool { self == .delete }

    var needsConfirmation: Bool {
        switch self {
        case .moveToInbox, .delete: true
        case .snooze: false
        }
    }
}

extension ChatQueueModel {
    public var pickedIds: [String] {
        sortedItems.map(\.id).filter { picked.contains($0) }
    }

    public var hasPicked: Bool { !pickedIds.isEmpty }

    public var deletableIds: [String] {
        sortedItems.filter { !$0.reviewChat && picked.contains($0.id) }.map(\.id)
    }

    public var skippedForDeleteCount: Int { pickedIds.count - deletableIds.count }

    func targetIds(for action: ChatQueueBulkAction) -> [String] {
        action == .delete ? deletableIds : pickedIds
    }

    func skipNotice(for action: ChatQueueBulkAction) -> String? {
        guard action == .delete, skippedForDeleteCount > 0 else { return nil }

        let count = skippedForDeleteCount

        return "\(count) review \(count == 1 ? "chat" : "chats") skipped: use Move to Inbox to clear them"
    }

    func pruneBulkSelection() {
        let live = Set(items.map(\.id))

        if !picked.isSubset(of: live) { picked.formIntersection(live) }
    }

    public func requestBulk(_ action: ChatQueueBulkAction) async -> Int {
        guard !isBulkRunning else { return 0 }

        let targets = targetIds(for: action)

        if targets.isEmpty {
            bulkNotice = skipNotice(for: action)

            return 0
        }

        let needsConfirm = action.alwaysConfirms || ChatQueueBulkRunner.needsConfirm(count: targets.count)

        if action.needsConfirmation, needsConfirm {
            confirmingAction = action
            isConfirmingBulk = true

            return 0
        }

        return await runBulk(action)
    }

    public func requestBulk(_ action: ChatQueueBulkAction, on id: String) async -> Int {
        if !picked.contains(id) { picked = [id] }

        return await requestBulk(action)
    }

    public func clearPicked() {
        picked = []
        bulkNotice = nil
    }

    public func pickAllVisible() {
        picked = Set(sortedItems.map(\.id))
    }

    @discardableResult
    public func runBulk(_ action: ChatQueueBulkAction) async -> Int {
        let ids = targetIds(for: action)
        let skipped = skipNotice(for: action)

        guard !ids.isEmpty else {
            bulkNotice = skipped

            return 0
        }

        let skippedIds = Set(pickedIds).subtracting(ids)
        let local = applyLocally(action, to: ids)

        isConfirmingBulk = false
        bulkNotice = skipped
        picked = skippedIds
        activeBulks += 1

        runInBackground(ids: ids) { [self] in
            let result = await ChatQueueBulkRunner.run(ids: ids) { [self] id in
                await perform(action, on: id)
            }

            for id in result.failed { revert(id, local) }

            picked.formUnion(result.failed.filter { id in items.contains { $0.id == id } })
            bulkNotice = [ChatQueueBulkRunner.notice(failed: result.failed.count, verb: action.failureVerb), skipped]
                .compactMap { $0 }
                .joined(separator: "; ")
                .nilIfEmpty
            activeBulks -= 1
        }

        return ids.count
    }

    private struct LocalBulkChange {
        var rows: [String: RemovedRow] = [:]
        var snoozes: [String: (before: ChatQueueItem, marked: ChatQueueItem)] = [:]
    }

    private func applyLocally(_ action: ChatQueueBulkAction, to ids: [String]) -> LocalBulkChange {
        var local = LocalBulkChange()

        for id in ids {
            if case .snooze(let days) = action {
                local.snoozes[id] = markSnoozed(id, until: Date().addingTimeInterval(TimeInterval(days) * 86_400))
            } else {
                local.rows[id] = takeOut(id)
            }
        }

        return local
    }

    private func revert(_ id: String, _ local: LocalBulkChange) {
        if let row = local.rows[id] { putBack(row) }

        if let change = local.snoozes[id] { restoreSnooze(change) }
    }

    private func perform(_ action: ChatQueueBulkAction, on id: String) async -> Bool {
        do {
            switch action {
            case .moveToInbox: try await returnAction(id)
            case .snooze(let days): try await snoozeAction(id, days: days)
            case .delete: try await deleteAction(id)
            }
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            guard failure == .notFound || failure == .notInChat else { return false }

            if case .snooze = action { resolved(id) }
        }

        pendingRemoval.remove(id)

        return true
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
