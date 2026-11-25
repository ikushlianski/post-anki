import PostAnkiAPI
import SwiftUI

struct RemovedKnowledgeRow {
    let following: Set<String>
    let item: KnowledgeOverviewItem
}

extension KnowledgeListModel {
    func deleteSelected() async {
        let ids = unlockedSelection()

        guard !ids.isEmpty, !selectionTooLarge else { return }

        let removed = items.enumerated().filter { ids.contains($0.element.id) }.map { RemovedKnowledgeRow(following: RowReinsertion.following($0.element.id, in: items), item: $0.element) }

        notice = nil
        failure = nil
        pendingDeletes.formUnion(ids)
        withAnimation { items.removeAll { ids.contains($0.id) } }
        selection.subtract(ids)

        writes.enqueue { [self] in
            defer { pendingDeletes.subtract(ids) }

            do {
                let result = try await APIClient.deleteKnowledgeBits(ids: Array(ids))
                let gone = Set(result.deleted).union(result.skipped.filter { $0.reason == "not_found" }.map(\.id))

                putBack(removed.filter { !gone.contains($0.item.id) })
                notice = result.summary()
            } catch {
                putBack(removed)
                failure = KnowledgeManageError.message(for: error, action: "delete these items")
            }
        }
    }

    func moveSelected(to subject: Subject) async {
        let ids = unlockedSelection()

        guard !ids.isEmpty, !selectionTooLarge else { return }

        let before = items.enumerated().filter { ids.contains($0.element.id) }.map { RemovedKnowledgeRow(following: RowReinsertion.following($0.element.id, in: items), item: $0.element) }

        notice = nil
        failure = nil
        selection.subtract(ids)

        for id in ids { pendingMoves[id] = subject.id }

        for index in items.indices where ids.contains(items[index].id) { items[index].subjectId = subject.id }

        writes.enqueue { [self] in
            defer { for id in ids { pendingMoves[id] = nil } }

            do {
                let result = try await APIClient.moveKnowledgeBits(ids: Array(ids), subjectId: subject.id)
                let refused = Set(ids).subtracting(result.moved)

                revert(before.filter { refused.contains($0.item.id) })
                notice = result.summary()
                needsReconcile = needsReconcile || subjectId != nil
            } catch {
                revert(before)
                failure = KnowledgeManageError.message(for: error, action: "move these items")

                if case APIError.badStatus(404, "subject_not_found") = error { await loadSubjects() }
            }
        }
    }

    func withPendingWrites(_ page: [KnowledgeOverviewItem]) -> [KnowledgeOverviewItem] {
        guard !pendingDeletes.isEmpty || !pendingMoves.isEmpty else { return page }

        return page.compactMap { item in
            guard !pendingDeletes.contains(item.id) else { return nil }

            guard let target = pendingMoves[item.id] else { return item }

            var moved = item

            moved.subjectId = target

            return moved
        }
    }

    func reconcile() async {
        guard needsReconcile else { return }

        needsReconcile = false
        await reload()
    }

    private func unlockedSelection() -> Set<String> {
        selection.filter { !pendingDeletes.contains($0) && pendingMoves[$0] == nil }
    }

    private func putBack(_ rows: [RemovedKnowledgeRow]) {
        let present = Set(items.map(\.id))

        withAnimation {
            for row in rows where !present.contains(row.item.id) {
                items.insert(row.item, at: RowReinsertion.index(in: items, before: row.following))
            }
        }
    }

    private func revert(_ rows: [RemovedKnowledgeRow]) {
        for row in rows {
            guard let index = items.firstIndex(where: { $0.id == row.item.id }) else { continue }

            items[index].subjectId = row.item.subjectId
        }
    }
}
