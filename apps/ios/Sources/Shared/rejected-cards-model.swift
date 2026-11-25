import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class RejectedCardsModel {
    var items: [RejectedCard] = []
    var reason: RejectedCardReason?
    private(set) var subjectId: String?
    private(set) var subjectOptions: [RejectedSubjectOption] = []
    var draft = ""
    private(set) var query: String?
    var counts: RejectedReasonCounts?
    var hasMore = false
    var hasLoaded = false
    var isLoading = false
    var failure: String?
    var notice: String?
    private(set) var subjectsFailed = false

    var subjectsNotice: String? {
        SubjectListNotice.rejectedFilterMessage(failed: subjectsFailed, optionCount: subjectOptions.count)
    }
    private(set) var pendingIds: Set<String> = []
    var selection = RejectedSelection()
    var isSelecting = false
    var bulkRunning = false

    let writes = SerialWriteQueue()

    @ObservationIgnored private var offset = 0
    @ObservationIgnored private var generation = 0

    func settle() async { await writes.settle() }

    func select(_ reason: RejectedCardReason?) async {
        guard reason != self.reason else { return }

        self.reason = reason
        await load()
    }

    func selectSubject(_ id: String?) async {
        guard id != subjectId else { return }

        subjectId = id
        await load()
    }

    func loadSubjects() async {
        do {
            subjectOptions = RejectedSubjectOptions.options(from: try await APIClient.listSubjects())
            subjectsFailed = false
        } catch {
            subjectsFailed = true
        }
    }

    func search(_ term: String?) async {
        guard term != query else { return }

        query = term
        await load()
    }

    func load() async {
        generation += 1

        let current = generation
        let filter = reason
        let subject = subjectId
        let term = query

        isLoading = true
        failure = nil

        do {
            let page = try await APIClient.rejectedCards(reason: filter, subjectId: subject, query: term, offset: 0)

            guard current == generation else { return }

            items = page.items.filter { !pendingIds.contains($0.id) }
            selection.keepOnly(items.map(\.id))
            counts = RejectedReasonCounts(page.reasonCounts) ?? counts
            offset = page.items.count
            hasMore = page.hasMore
            hasLoaded = true
        } catch {
            guard current == generation, !KnowledgeManageError.isCancellation(error) else { return }

            failure = KnowledgeManageError.message(for: error, action: "load rejected cards")
        }

        if current == generation { isLoading = false }
    }

    func restore(_ card: RejectedCard) async {
        guard let row = takeOut(card.id) else { return }

        TriageFeedbackPlayer.announce(.restored)

        writes.enqueue { [self] in
            defer { pendingIds.remove(card.id) }

            do {
                try await APIClient.restoreRejectedCard(id: card.id)
                await refreshCounts()
            } catch {
                switch RejectedCardRestoreOutcome.outcome(for: error) {
                case .restored, .alreadyGone:
                    await refreshCounts()
                case .notRejected:
                    notice = "That card is no longer rejected. List refreshed."
                    pendingIds.remove(card.id)
                    await load()
                case .failed:
                    putBack(row)

                    if !KnowledgeManageError.isCancellation(error) {
                        failure = KnowledgeManageError.message(for: error, action: "restore the card")
                    }
                }
            }
        }
    }

    func sendToChat(_ card: RejectedCard) async {
        guard let row = takeOut(card.id) else { return }

        TriageFeedbackPlayer.announce(.sentToChat)

        writes.enqueue { [self] in
            defer { pendingIds.remove(card.id) }

            guard await APIClient.sendTriageDecisionToChat(id: card.id, wasRejected: true) else {
                putBack(row)
                failure = "Couldn't send the card to Chat. Try again."

                return
            }

            await refreshCounts()
            await ChatQueueCountStore.shared.refresh()
        }
    }

    private func takeOut(_ id: String) -> (following: Set<String>, card: RejectedCard)? {
        guard !pendingIds.contains(id), let index = items.firstIndex(where: { $0.id == id }) else { return nil }

        let row = (following: RowReinsertion.following(id, in: items), card: items[index])

        failure = nil
        notice = nil
        pendingIds.insert(id)
        remove(id)

        return row
    }

    private func putBack(_ row: (following: Set<String>, card: RejectedCard)) {
        guard !items.contains(where: { $0.id == row.card.id }) else { return }

        items.insert(row.card, at: RowReinsertion.index(in: items, before: row.following))
        offset += 1
    }

    private func refreshCounts() async {
        guard let page = try? await APIClient.rejectedCards(reason: reason, subjectId: subjectId, query: query, offset: 0, limit: 1) else { return }

        counts = RejectedReasonCounts(page.reasonCounts)
    }

    private func remove(_ id: String) {
        items.removeAll { $0.id == id }
        offset = max(0, offset - 1)
        selection.keepOnly(items.map(\.id))
    }

    func setSelecting(_ on: Bool) {
        isSelecting = on
        selection.clear()
    }

    func restoreSelected() async {
        let ids = selection.orderedIds(in: items.map(\.id))

        guard !ids.isEmpty, !bulkRunning else { return }

        bulkRunning = true
        failure = nil
        notice = nil
        selection.clearFailed(ids)
        defer { bulkRunning = false }

        var entries: [(id: String, outcome: RejectedCardRestoreOutcome)] = []

        for start in stride(from: 0, to: ids.count, by: RejectedBulkRestoreResult.concurrency) {
            let chunk = Array(ids[start..<min(start + RejectedBulkRestoreResult.concurrency, ids.count)])

            let results = await withTaskGroup(of: (String, RejectedCardRestoreOutcome).self) { group in
                for id in chunk {
                    group.addTask {
                        do {
                            try await APIClient.restoreRejectedCard(id: id)

                            return (id, .restored)
                        } catch {
                            return (id, RejectedCardRestoreOutcome.outcome(for: error))
                        }
                    }
                }

                var collected: [String: RejectedCardRestoreOutcome] = [:]

                for await (id, outcome) in group { collected[id] = outcome }

                return collected
            }

            entries += chunk.compactMap { id in results[id].map { (id: id, outcome: $0) } }
        }

        let result = RejectedBulkRestoreResult(outcomes: entries)
        let previews = result.failed.compactMap { id in items.first { $0.id == id }.map { String(CardKind.hideBlanks($0.body).prefix(40)) } }

        for id in result.removed { remove(id) }

        selection.markFailed(result.failed)
        selection.keepOnly(result.failed)

        if let text = result.announcement { TriageFeedbackPlayer.announce(message: text) }

        if result.restoredAny || result.stale { await refreshCounts() }

        if result.stale { await load() }

        failure = result.message(failedPreviews: previews)
    }

    func loadMore(current item: RejectedCard) async {
        guard hasMore, !isLoading, items.last?.id == item.id else { return }

        let token = generation

        isLoading = true
        defer { if token == generation { isLoading = false } }

        do {
            let page = try await APIClient.rejectedCards(reason: reason, subjectId: subjectId, query: query, offset: offset)

            guard token == generation else { return }

            let known = Set(items.map(\.id))

            items += page.items.filter { !known.contains($0.id) && !pendingIds.contains($0.id) }
            offset += page.items.count
            hasMore = page.hasMore
        } catch {
            guard token == generation, !KnowledgeManageError.isCancellation(error) else { return }

            failure = KnowledgeManageError.message(for: error, action: "load more rejected cards")
        }
    }
}

