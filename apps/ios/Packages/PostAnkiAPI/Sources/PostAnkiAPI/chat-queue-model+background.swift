import Foundation

struct RemovedRow {
    let item: ChatQueueItem
    let index: Int
}

extension ChatQueueModel {
    @discardableResult
    func runInBackground(ids: [String], _ work: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let key = UUID()
        let previous = ids.compactMap { itemTails[$0] }
        let task = Task { [weak self] in
            for earlier in previous { await earlier.value }

            await work()
            self?.backgroundTasks[key] = nil
        }

        backgroundTasks[key] = task

        for id in ids { itemTails[id] = task }

        return task
    }

    public func settleBackgroundActions() async {
        while let task = backgroundTasks.values.first { await task.value }
    }

    var activeCount: Int { items.filter { !$0.isSnoozed() }.count }

    func takeOut(_ id: String) -> RemovedRow? {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return nil }

        let row = RemovedRow(item: items[index], index: index)

        resolved(id)
        pendingRemoval.insert(id)

        return row
    }

    func putBack(_ row: RemovedRow) {
        let id = row.item.id

        pendingRemoval.remove(id)
        removedDuringLoad.remove(id)

        guard !items.contains(where: { $0.id == id }) else { return }

        items.insert(row.item, at: min(row.index, items.count))
        actions.setCount(activeCount)
    }

    func failedToLeave(_ row: RemovedRow, _ error: Error) {
        let failure = ChatQueueFailure.failure(for: error)

        errorMessage = failure.message

        if failure == .notFound || failure == .notInChat {
            pendingRemoval.remove(row.item.id)
        } else {
            putBack(row)
        }
    }

    func markSnoozed(_ id: String, until date: Date?) -> (before: ChatQueueItem, marked: ChatQueueItem)? {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return nil }

        let before = items[index]
        let marked = before.withSnoozedUntil(date)

        items[index] = marked
        actions.setCount(activeCount)

        return (before, marked)
    }

    func restoreSnooze(_ change: (before: ChatQueueItem, marked: ChatQueueItem)) {
        guard let index = items.firstIndex(where: { $0.id == change.marked.id }), items[index] == change.marked else { return }

        items[index] = change.before
        actions.setCount(activeCount)
    }

    func changeSnooze(_ id: String, until date: Date?, _ send: @escaping @MainActor () async throws -> Void) async {
        errorMessage = nil

        guard let change = markSnoozed(id, until: date) else { return }

        runInBackground(ids: [id]) { [self] in
            do {
                try await send()
            } catch {
                let failure = ChatQueueFailure.failure(for: error)

                errorMessage = failure.message

                if failure == .notFound || failure == .notInChat { resolved(id) } else { restoreSnooze(change) }
            }
        }
    }
}
