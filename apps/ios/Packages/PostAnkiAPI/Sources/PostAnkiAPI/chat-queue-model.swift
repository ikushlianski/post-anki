import Foundation
import Observation

public struct ChatQueueActions {
    public var list: @MainActor () async throws -> ChatQueueList
    public var returnToInbox: @MainActor (String) async throws -> Void
    public var snooze: @MainActor (String, Int) async throws -> Void
    public var unsnooze: @MainActor (String) async throws -> Void
    public var setCount: @MainActor (Int) -> Void

    public init(
        list: @escaping @MainActor () async throws -> ChatQueueList,
        returnToInbox: @escaping @MainActor (String) async throws -> Void,
        snooze: @escaping @MainActor (String, Int) async throws -> Void,
        unsnooze: @escaping @MainActor (String) async throws -> Void,
        setCount: @escaping @MainActor (Int) -> Void
    ) {
        self.list = list
        self.returnToInbox = returnToInbox
        self.snooze = snooze
        self.unsnooze = unsnooze
        self.setCount = setCount
    }
}

@Observable
@MainActor
public final class ChatQueueModel {
    public var items: [ChatQueueItem] = [] {
        didSet { reconcileSubject() }
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
    public var isMovingAll = false
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

    @ObservationIgnored private let actions: ChatQueueActions
    @ObservationIgnored private let orderStore: ChatQueueOrderStoring
    @ObservationIgnored private var inFlight: Set<String> = []
    @ObservationIgnored private var removedDuringLoad: Set<String> = []

    public init(actions: ChatQueueActions, orderStore: ChatQueueOrderStoring = InMemoryChatQueueOrderStore()) {
        self.actions = actions
        self.orderStore = orderStore
        self.sortOrder = orderStore.load()
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
            let kept = list.items.filter { !removedDuringLoad.contains($0.id) }
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
        await change(id) { try await self.actions.snooze(id, days) }
    }

    public func unsnooze(_ id: String) async {
        await change(id) { try await self.actions.unsnooze(id) }
    }

    @discardableResult
    public func returnToInbox(_ id: String) async -> Bool {
        guard inFlight.insert(id).inserted else { return false }

        defer { inFlight.remove(id) }

        errorMessage = nil

        do {
            try await actions.returnToInbox(id)
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            errorMessage = failure.message

            if failure == .notFound || failure == .notInChat { resolved(id) }

            return false
        }

        resolved(id)

        return true
    }

    @discardableResult
    public func moveAllVisibleToInbox() async -> Int {
        guard !isMovingAll, isStaleFilterActive else { return 0 }

        let ids = movableVisibleItems.map(\.id)

        guard !ids.isEmpty else { return 0 }

        isMovingAll = true
        errorMessage = nil
        defer { isMovingAll = false }

        var failed = 0
        var moved = 0

        for id in ids {
            do {
                try await actions.returnToInbox(id)
                moved += 1
                resolved(id)
            } catch {
                let failure = ChatQueueFailure.failure(for: error)

                if failure == .notFound || failure == .notInChat {
                    resolved(id)
                } else {
                    failed += 1
                }
            }
        }

        await load()

        if failed > 0 {
            errorMessage = "\(failed) \(failed == 1 ? "card" : "cards") could not be moved"
        }

        return moved
    }

    private func change(_ id: String, _ action: () async throws -> Void) async {
        errorMessage = nil

        do {
            try await action()
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            errorMessage = failure.message

            if failure == .notFound || failure == .notInChat { resolved(id) }

            return
        }

        await load()
    }
}
