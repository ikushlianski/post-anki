import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class LearningListModel {
    var items: [LearningListItem] = []
    var subjects: [Subject] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var actionMessage: String?
    var subjectsFailed = false
    var deciding: Set<String> = []
    var approving: Set<String> = []
    let writes = SerialWriteQueue()

    var subjectsNotice: String? {
        SubjectListNotice.learningListMessage(failed: subjectsFailed, subjectCount: subjects.count)
    }

    var awaiting: [LearningListItem] { items.filter { $0.isAwaitingDecision && !approving.contains($0.id) } }
    var parked: [LearningListItem] { items.filter { $0.status == "parked" } }
    var working: [LearningListItem] {
        items.filter { ["captured", "classifying"].contains($0.status) || approving.contains($0.id) }
    }

    var done: [LearningListItem] {
        items.filter { ["folded_in", "course_created", "declined", "unreachable"].contains($0.status) && !approving.contains($0.id) }
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            items = try await APIClient.listLearningItems()
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = LearningListError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }
    }

    func settle() async { await writes.settle() }

    func decide(_ item: LearningListItem, approve: Bool) async {
        guard !deciding.contains(item.id), let index = items.firstIndex(where: { $0.id == item.id }) else { return }

        let before = items[index]

        actionMessage = nil
        deciding.insert(item.id)

        if approve {
            approving.insert(item.id)
        } else {
            items[index].status = "declined"
        }

        writes.enqueue { [self] in
            defer {
                deciding.remove(item.id)
                approving.remove(item.id)
            }

            do {
                let result = try await APIClient.decideLearningItem(id: item.id, approve: approve)

                replace(result.item)
            } catch {
                if let current = items.firstIndex(where: { $0.id == item.id }) { items[current] = before }

                actionMessage = LearningListError.message(for: error)
            }
        }
    }

    func loadSubjects() async {
        guard subjects.isEmpty else { return }

        do {
            subjects = try await APIClient.listSubjects()
            subjectsFailed = false
        } catch {
            subjectsFailed = true
        }
    }

    func replace(_ item: LearningListItem) {
        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index] = item
        } else {
            items.insert(item, at: 0)
        }
    }
}

@Observable
@MainActor
final class CaptureLearningItemModel {
    var url = ""
    var kind = "article"
    var description = ""
    var subjectId = ""
    var isSaving = false
    var errorMessage: String?

    var needsDescription: Bool { kind == "video" }

    var canSave: Bool {
        !isSaving
            && !subjectId.isEmpty
            && !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (!needsDescription || !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    func save() async -> LearningListItem? {
        guard canSave else { return nil }

        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            return try await APIClient.captureLearningItem(
                url: url.trimmingCharacters(in: .whitespacesAndNewlines),
                kind: kind,
                description: needsDescription ? text : nil,
                subjectId: subjectId
            )
        } catch {
            errorMessage = LearningListError.message(for: error)

            return nil
        }
    }
}
