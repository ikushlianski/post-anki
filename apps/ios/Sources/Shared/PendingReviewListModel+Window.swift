import Foundation
import PostAnkiAPI

extension PendingReviewListModel {
    var isWindowComplete: Bool { windowExhausted && windowScope == nil }

    func isExhausted(for subjectId: String?) -> Bool {
        windowExhausted && (windowScope == nil || windowScope == subjectId)
    }

    func resetWindow(exhausted: Bool, scope: String?) {
        windowGeneration += 1
        topUpTask?.cancel()
        topUpTask = nil
        windowExhausted = exhausted
        windowScope = scope
        serverUnloaded = nil
        windowCursor = nil
    }

    func recordServerTotal(_ total: Int?, loaded: [PendingReviewSource], subjectId: String?) {
        serverUnloaded = total.map { (subjectId, max(0, $0 - PendingReviewWindow.bitCount(loaded))) }
    }

    func topUpIfNeeded(remaining: Int, subjectId: String?) {
        guard PendingReviewWindow.needsTopUp(
            remaining: remaining,
            exhausted: isExhausted(for: subjectId),
            inFlight: topUpTask != nil
        ) else { return }

        topUpTask = Task { [weak self] in await self?.topUp(subjectId: subjectId) }
    }

    func rowAppeared(_ bitId: String) {
        guard windowed, !isExhausted(for: scopeSubjectId), topUpTask == nil else { return }

        let ids = sources.flatMap(\.bits).map(\.id)

        guard let index = ids.firstIndex(of: bitId) else { return }

        topUpIfNeeded(remaining: ids.count - index - 1, subjectId: scopeSubjectId)
    }

    func remainingTotal(ready: Int, loaded: Int, subjectId: String?) -> Int {
        if let serverUnloaded, serverUnloaded.subjectId == subjectId { return ready + serverUnloaded.count }

        guard subjectId == nil, !isExhausted(for: nil) else { return ready }

        return ready + max(0, counts.count - loaded)
    }

    private func topUp(subjectId: String?) async {
        let generation = windowGeneration
        let cursor = windowCursor
        let limit = cursor == nil ? PendingReviewWindow.fetchLimit(known: knownBitCount) : PendingReviewWindow.topUpLimit

        defer {
            if generation == windowGeneration { topUpTask = nil }
        }

        guard let page = try? await APIClient.listPendingReviewPage(limit: limit, subjectId: subjectId, attention: false, after: cursor),
              !Task.isCancelled,
              generation == windowGeneration
        else { return }

        let fetched = page.sources
        let result = PendingReviewWindow.merge(held: sources, incoming: fetched, excluded: removedDuringLoad)

        sources = result.sources
        windowCursor = PendingReviewWindow.cursor(after: cursor, loaded: fetched)
        recordServerTotal(page.total, loaded: sources, subjectId: subjectId)

        let shortPage = PendingReviewWindow.bitCount(fetched) < limit
        let stalled = cursor == nil ? result.added == 0 : fetched.isEmpty

        if shortPage || stalled {
            windowExhausted = true
            windowScope = subjectId
        }
    }

    private var knownBitCount: Int {
        PendingReviewWindow.bitCount(sources) + removedDuringLoad.count
    }
}
