import Foundation
import Observation

public struct ChatQueueActions {
    public var list: @MainActor () async throws -> ChatQueueList
    public var returnToInbox: @MainActor (String) async throws -> Void
    public var snooze: @MainActor (String, Int) async throws -> Void
    public var unsnooze: @MainActor (String) async throws -> Void
    public var delete: @MainActor (String) async throws -> Void
    public var setCount: @MainActor (Int) -> Void

    public init(
        list: @escaping @MainActor () async throws -> ChatQueueList,
        returnToInbox: @escaping @MainActor (String) async throws -> Void,
        snooze: @escaping @MainActor (String, Int) async throws -> Void,
        unsnooze: @escaping @MainActor (String) async throws -> Void,
        delete: @escaping @MainActor (String) async throws -> Void = { _ in throw URLError(.unsupportedURL) },
        setCount: @escaping @MainActor (Int) -> Void
    ) {
        self.list = list
        self.returnToInbox = returnToInbox
        self.snooze = snooze
        self.unsnooze = unsnooze
        self.delete = delete
        self.setCount = setCount
    }
}

@Observable
@MainActor
public final class ChatQueueModel {
    public var items: [ChatQueueItem] = [] {
        didSet {
            reconcileSubject()
            pruneBulkSelection()
        }
    }
    public var isLoading = false
    public var hasLoaded = false
    public var errorMessage: String?
    public var sortOrder: ChatQueueSortOrder {
        didSet {
            if sortOrder != oldValue { orderStore.save(sortOrder) }
        }
    }

    public var staleOnly = false {
        didSet { reconcileSubject() }
    }

    public var subject: String? {
        didSet { reconcileSubject() }
    }
    public var isMovingAll: Bool { activeMoveAlls > 0 }
    public var picked: Set<String> = []
    public var pickAnchor: String?
    public var isBulkRunning: Bool { activeBulks > 0 }
    public var bulkNotice: String?
    public var isConfirmingBulk = false
    public var confirmingAction: ChatQueueBulkAction = .moveToInbox
    private var truncationTracker = TruncationTracker()

    public var truncation: ListTruncation? { truncationTracker.truncation(shown: items.count) }

    public var hasStaleItems: Bool {
        !ChatQueueWaiting.stale(items).isEmpty
    }

    public var isStaleFilterActive: Bool {
        staleOnly && hasStaleItems
    }

    public var movableVisibleItems: [ChatQueueItem] {
        sortedItems.filter { !$0.reviewChat }
    }

    public var sortedItems: [ChatQueueItem] {
        let visible = ChatQueueSubjectFilter.apply(subjectScope, subject: subject)

        return ChatQueueWaiting.sorted(visible, order: sortOrder)
    }

    public var subjectNames: [String] {
        ChatQueueSubjectFilter.subjects(subjectScope)
    }

    private var subjectScope: [ChatQueueItem] {
        isStaleFilterActive ? ChatQueueWaiting.stale(items) : items
    }

    private func reconcileSubject() {
        guard let current = subject, !subjectNames.contains(current) else { return }

        subject = nil
    }

    @ObservationIgnored let actions: ChatQueueActions
    @ObservationIgnored private let orderStore: ChatQueueOrderStoring
    @ObservationIgnored var removedDuringLoad: Set<String> = []
    @ObservationIgnored var pendingRemoval: Set<String> = []
    @ObservationIgnored var itemTails: [String: Task<Void, Never>] = [:]
    @ObservationIgnored var backgroundTasks: [UUID: Task<Void, Never>] = [:]
    var activeBulks = 0
    var activeMoveAlls = 0

    public init(actions: ChatQueueActions, orderStore: ChatQueueOrderStoring = InMemoryChatQueueOrderStore()) {
        self.actions = actions
        self.orderStore = orderStore
        self.sortOrder = orderStore.load()
    }

    func returnAction(_ id: String) async throws {
        try await actions.returnToInbox(id)
    }

    func deleteAction(_ id: String) async throws {
        try await actions.delete(id)
    }

    func snoozeAction(_ id: String, days: Int) async throws {
        try await actions.snooze(id, days)
    }

    public func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        removedDuringLoad = []
        defer {
            isLoading = false
            removedDuringLoad = []
        }

        do {
            let list = try await actions.list()
            let kept = list.items.filter { !removedDuringLoad.contains($0.id) && !pendingRemoval.contains($0.id) }
            let dropped = list.items.count - kept.count

            items = kept
            truncationTracker = TruncationTracker(list.truncation)
            hasLoaded = true
            actions.setCount(max(0, list.count - dropped))
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            errorMessage = ChatQueueFailure.failure(for: error).message
        }
    }

    public func resolved(_ id: String) {
        if isLoading { removedDuringLoad.insert(id) }

        if items.contains(where: { $0.id == id }) { truncationTracker.removedOne() }

        items.removeAll { $0.id == id }
        actions.setCount(items.filter { !$0.isSnoozed() }.count)
    }

    public func snooze(_ id: String, days: Int) async {
        let until = Date().addingTimeInterval(TimeInterval(days) * 86_400)

        await changeSnooze(id, until: until) { try await self.actions.snooze(id, days) }
    }

    public func unsnooze(_ id: String) async {
        await changeSnooze(id, until: nil) { try await self.actions.unsnooze(id) }
    }

    @discardableResult
    public func returnToInbox(_ id: String) async -> Bool {
        errorMessage = nil

        guard let row = takeOut(id) else { return false }

        runInBackground(ids: [id]) { [self] in
            do {
                try await actions.returnToInbox(id)
                pendingRemoval.remove(id)
            } catch {
                failedToLeave(row, error)
            }
        }

        return true
    }

    @discardableResult
    public func moveAllVisibleToInbox() async -> Int {
        guard isStaleFilterActive else { return 0 }

        let ids = movableVisibleItems.map(\.id)

        guard !ids.isEmpty else { return 0 }

        errorMessage = nil

        let rows = ids.compactMap { takeOut($0) }

        activeMoveAlls += 1
        runInBackground(ids: ids) { [self] in
            var failed: [RemovedRow] = []

            for row in rows {
                do {
                    try await actions.returnToInbox(row.item.id)
                    pendingRemoval.remove(row.item.id)
                } catch {
                    let failure = ChatQueueFailure.failure(for: error)

                    if failure == .notFound || failure == .notInChat {
                        pendingRemoval.remove(row.item.id)
                    } else {
                        failed.append(row)
                    }
                }
            }

            failed.forEach { putBack($0) }
            activeMoveAlls -= 1
            await load()

            if !failed.isEmpty {
                errorMessage = "\(failed.count) \(failed.count == 1 ? "card" : "cards") could not be moved"
            }
        }

        return rows.count
    }

    public func reloadAfterRollback(_ id: String, message: String) async {
        removedDuringLoad.remove(id)
        await load()
        errorMessage = message
    }
}
