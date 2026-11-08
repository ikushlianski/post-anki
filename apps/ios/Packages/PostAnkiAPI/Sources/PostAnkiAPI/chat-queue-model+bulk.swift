import Foundation

public enum ChatQueueBulkAction: Sendable {
    case moveToInbox
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

        if ChatQueueBulkRunner.needsConfirm(count: pickedIds.count) {
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
        bulkNotice = ChatQueueBulkRunner.notice(failed: result.failed.count)

        return result.succeeded.count
    }

    private func perform(_ action: ChatQueueBulkAction, on id: String) async -> Bool {
        switch action {
        case .moveToInbox:
            return await bulkReturnToInbox(id)
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
}
