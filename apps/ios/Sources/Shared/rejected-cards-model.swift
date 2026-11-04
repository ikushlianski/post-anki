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
    var restoringId: String?
    var selection = RejectedSelection()
    var isSelecting = false
    var bulkRunning = false

    @ObservationIgnored private var offset = 0
    @ObservationIgnored private var generation = 0

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

            items = page.items
            selection.keepOnly(page.items.map(\.id))
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
        guard restoringId == nil else { return }

        restoringId = card.id
        failure = nil
        notice = nil
        defer { restoringId = nil }

        do {
            try await APIClient.restoreRejectedCard(id: card.id)
            remove(card.id)
            TriageFeedbackPlayer.announce(.restored)
            await refreshCounts()
        } catch {
            guard !KnowledgeManageError.isCancellation(error) else { return }

            switch RejectedCardRestoreOutcome.outcome(for: error) {
            case .restored, .alreadyGone:
                remove(card.id)
                await refreshCounts()
            case .notRejected:
                notice = "That card is no longer rejected. List refreshed."
                await load()
            case .failed:
                failure = KnowledgeManageError.message(for: error, action: "restore the card")
            }
        }
    }

    func sendToChat(_ card: RejectedCard) async {
        guard restoringId == nil else { return }

        restoringId = card.id
        failure = nil
        notice = nil
        defer { restoringId = nil }

        guard await APIClient.sendTriageDecisionToChat(id: card.id, wasRejected: true) else {
            failure = "Couldn't send the card to Chat. Try again."

            return
        }

        remove(card.id)
        TriageFeedbackPlayer.announce(.sentToChat)
        await refreshCounts()
        await ChatQueueCountStore.shared.refresh()
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

        guard !ids.isEmpty, !bulkRunning, restoringId == nil else { return }

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

            items += page.items.filter { !known.contains($0.id) }
            offset += page.items.count
            hasMore = page.hasMore
        } catch {
            guard token == generation, !KnowledgeManageError.isCancellation(error) else { return }

            failure = KnowledgeManageError.message(for: error, action: "load more rejected cards")
        }
    }
}

