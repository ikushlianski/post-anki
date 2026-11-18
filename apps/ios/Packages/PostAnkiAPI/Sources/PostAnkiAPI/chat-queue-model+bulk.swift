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
        movableVisibleItems.map(\.id).filter { picked.contains($0) }
    }

    public var hasPicked: Bool { !pickedIds.isEmpty }

    func pruneBulkSelection() {
        let live = Set(items.map(\.id))

        if !picked.isSubset(of: live) { picked.formIntersection(live) }
    }

    public func requestBulk(_ action: ChatQueueBulkAction) async -> Int {
        guard !isBulkRunning else { return 0 }

        let needsConfirm = action.alwaysConfirms || ChatQueueBulkRunner.needsConfirm(count: pickedIds.count)

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
        picked = Set(movableVisibleItems.map(\.id))
    }

    @discardableResult
    public func runBulk(_ action: ChatQueueBulkAction) async -> Int {
        guard !isBulkRunning else { return 0 }

        let ids = pickedIds

        guard !ids.isEmpty else { return 0 }

        isConfirmingBulk = false
        isBulkRunning = true
        bulkNotice = nil
        defer { isBulkRunning = false }

        let result = await ChatQueueBulkRunner.run(ids: ids) { [self] id in
            await perform(action, on: id)
        }

        picked = Set(result.failed)
        bulkNotice = ChatQueueBulkRunner.notice(failed: result.failed.count, verb: action.failureVerb)

        if case .snooze = action, !result.succeeded.isEmpty { await load() }

        return result.succeeded.count
    }

    private func perform(_ action: ChatQueueBulkAction, on id: String) async -> Bool {
        switch action {
        case .moveToInbox:
            return await bulkReturnToInbox(id)
        case .snooze(let days):
            return await bulkSnooze(id, days: days)
        case .delete:
            return await bulkDelete(id)
        }
    }

    private func bulkReturnToInbox(_ id: String) async -> Bool {
        do {
            try await returnAction(id)
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            guard failure == .notFound || failure == .notInChat else { return false }
        }

        resolved(id)

        return true
    }

    private func bulkDelete(_ id: String) async -> Bool {
        do {
            try await deleteAction(id)
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            guard failure == .notFound || failure == .notInChat else { return false }
        }

        resolved(id)

        return true
    }

    private func bulkSnooze(_ id: String, days: Int) async -> Bool {
        do {
            try await snoozeAction(id, days: days)
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            guard failure == .notFound || failure == .notInChat else { return false }

            resolved(id)
        }

        return true
    }
}
