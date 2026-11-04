import Foundation
import PostAnkiAPI

@Observable
@MainActor
final class NotionSourceFormModel {
    let editingId: String?
    var name: String
    var pageUrl: String
    var itemsPerRun: Int
    var frequency: NotionSourceFrequency
    var removeAfterImport: Bool
    let subjects = AddKnowledgeSubjectPickerModel()

    init(editing source: NotionIngestionSource? = nil) {
        editingId = source?.id
        name = source?.name ?? ""
        pageUrl = source?.pageUrl ?? ""
        itemsPerRun = source?.itemsPerRun ?? NotionSourceLimits.defaultItemsPerRun
        frequency = source?.frequency ?? .manual
        removeAfterImport = source?.removeAfterImport ?? false
        subjects.selectedId = source?.subjectId
    }

    var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var trimmedUrl: String { pageUrl.trimmingCharacters(in: .whitespacesAndNewlines) }

    var urlIsValid: Bool { trimmedUrl.isEmpty || NotionPageLink.isValid(trimmedUrl) }

    var canSave: Bool {
        !trimmedName.isEmpty
            && NotionPageLink.isValid(trimmedUrl)
            && subjects.selectedId != nil
            && NotionSourceLimits.itemsPerRun.contains(itemsPerRun)
    }

    func createInput() -> NotionSourceInput {
        NotionSourceInput(
            name: trimmedName,
            pageUrl: trimmedUrl,
            subjectId: subjects.selectedId ?? "",
            itemsPerRun: itemsPerRun,
            frequency: frequency,
            removeAfterImport: removeAfterImport
        )
    }

    func updateInput() -> NotionSourceUpdate {
        NotionSourceUpdate(
            name: trimmedName,
            pageUrl: trimmedUrl,
            subjectId: subjects.selectedId,
            itemsPerRun: itemsPerRun,
            frequency: frequency,
            removeAfterImport: removeAfterImport
        )
    }
}
