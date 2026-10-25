import PostAnkiAPI
import SwiftUI

enum KnowledgeStatusFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case new = "New"
    case learning = "Learning"
    case review = "Review"
    case suspended = "Suspended"

    var id: String { rawValue }

    func matches(_ state: String) -> Bool {
        switch self {
        case .all, .suspended: return true
        case .new: return state == "new"
        case .learning: return state == "learning" || state == "relearning"
        case .review: return state == "review"
        }
    }
}

@Observable
@MainActor
final class KnowledgeListModel {
    static let selectionLimit = 200

    var items: [KnowledgeOverviewItem] = []
    var hasMore = false
    var subjectId: String?
    var query = ""
    var statusFilter: KnowledgeStatusFilter = .all
    var subjects: [Subject] = []
    var selection: Set<String> = []
    var isLoading = false
    var isLoadingMore = false
    var hasLoaded = false
    var isBulkBusy = false
    var failure: String?
    var failureKind: ProgressLoadError?
    var notice: String?

    @ObservationIgnored private var offset = 0
    @ObservationIgnored private var requestToken = 0
    @ObservationIgnored private var loadTask: Task<Void, Never>?

    var visibleItems: [KnowledgeOverviewItem] {
        items.filter { statusFilter.matches($0.state) }
    }

    var hasActiveFilter: Bool {
        subjectId != nil || statusFilter != .all || !query.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var selectionTooLarge: Bool { selection.count > Self.selectionLimit }

    func subjectName(for id: String?) -> String? {
        guard let id else { return nil }

        return subjects.first { $0.id == id }?.name
    }

    func start() async {
        async let loaded: Void = loadSubjects()

        await reload()
        await loaded
    }

    func loadSubjects() async {
        if let fetched = try? await APIClient.listSubjects() {
            subjects = fetched
        }
    }

    func reload() async {
        loadTask?.cancel()

        let task = Task { await loadFirstPage() }

        loadTask = task
        await task.value
    }

    func scheduleReload(debounce: Duration = .zero) {
        loadTask?.cancel()
        loadTask = Task { [weak self] in
            if debounce > .zero { try? await Task.sleep(for: debounce) }

            guard !Task.isCancelled, let self else { return }

            await loadFirstPage()
        }
    }

    func loadMoreIfNeeded(current item: KnowledgeOverviewItem) async {
        guard hasMore, !isLoading, !isLoadingMore, items.last?.id == item.id else { return }

        isLoadingMore = true
        requestToken += 1

        let token = requestToken
        let pageOffset = offset

        defer { if token == requestToken { isLoadingMore = false } }

        do {
            let page = try await APIClient.knowledgeOverview(subjectId: subjectId, q: trimmedQuery, offset: pageOffset)

            guard token == requestToken else { return }

            let known = Set(items.map(\.id))

            items += page.items.filter { !known.contains($0.id) }
            offset = pageOffset + page.items.count
            hasMore = page.hasMore
            failure = nil
        } catch {
            guard token == requestToken, !KnowledgeManageError.isCancellation(error) else { return }

            failure = KnowledgeManageError.message(for: error, action: "load more items")
        }
    }

    func update(_ itemId: String, state: String) {
        guard let index = items.firstIndex(where: { $0.id == itemId }) else { return }

        items[index].state = state
    }

    func remove(_ itemId: String) {
        items.removeAll { $0.id == itemId }
        selection.remove(itemId)
    }

    func toggle(_ id: String) {
        if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
    }

    private var trimmedQuery: String? {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)

        return text.isEmpty ? nil : String(text.prefix(200))
    }

    private func loadFirstPage() async {
        requestToken += 1

        let token = requestToken

        isLoading = true
        isLoadingMore = false
        failure = nil
        failureKind = nil
        defer { if token == requestToken { isLoading = false } }

        do {
            let page = try await APIClient.knowledgeOverview(subjectId: subjectId, q: trimmedQuery, offset: 0)

            guard token == requestToken else { return }

            items = page.items
            offset = page.items.count
            hasMore = page.hasMore
            hasLoaded = true
            selection = selection.intersection(Set(items.map(\.id)))
        } catch {
            guard token == requestToken, !KnowledgeManageError.isCancellation(error) else { return }

            failure = KnowledgeManageError.message(for: error, action: "load items")
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }
}
