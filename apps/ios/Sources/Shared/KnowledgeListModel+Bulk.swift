import PostAnkiAPI
import SwiftUI

extension KnowledgeListModel {
    func deleteSelected() async {
        let ids = Array(selection)

        guard !ids.isEmpty, !selectionTooLarge, !isBulkBusy else { return }

        isBulkBusy = true
        notice = nil
        failure = nil
        defer { isBulkBusy = false }

        do {
            let result = try await APIClient.deleteKnowledgeBits(ids: ids)
            let gone = Set(result.deleted).union(result.skipped.filter { $0.reason == "not_found" }.map(\.id))

            withAnimation { items.removeAll { gone.contains($0.id) } }
            selection.subtract(gone)
            notice = result.summary()
        } catch {
            failure = KnowledgeManageError.message(for: error, action: "delete these items")
        }
    }

    func moveSelected(to subject: Subject) async {
        let ids = Array(selection)

        guard !ids.isEmpty, !selectionTooLarge, !isBulkBusy else { return }

        isBulkBusy = true
        notice = nil
        failure = nil
        defer { isBulkBusy = false }

        do {
            let result = try await APIClient.moveKnowledgeBits(ids: ids, subjectId: subject.id)

            selection = []
            notice = result.summary()
            await reload()
        } catch {
            failure = KnowledgeManageError.message(for: error, action: "move these items")

            if case APIError.badStatus(404, "subject_not_found") = error { await loadSubjects() }
        }
    }
}
