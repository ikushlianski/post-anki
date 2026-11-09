import PostAnkiAPI

final class InMemoryAddDraftStore: AddDraftStoring {
    private var drafts: [String: String] = [:]

    func load(key: String) -> String { drafts[key] ?? "" }
    func save(_ draft: String, key: String) { drafts[key] = draft }
    func clear(key: String) { drafts[key] = nil }
    func clearAll() { drafts = [:] }
}

struct AddKnowledgeScreenState {
    var text = ""
    var extraPieces: [String] = []
    var isSubmitting = false
    var activeDetections = 0
    var hasSent = false
    var summaryText: String?
    var errorMessage: String?
    var canAddAnyway = false
    var subjects: [Subject] = []
    var selectedSubjectId: String?
    var subjectsLoadFailed = false
    var isSubjectTreeExpanded = false
    var isPhrasesExpanded = false
    var targetPhrases: [String] = [""]
}

extension IngestionDictationScreenModel {
    convenience init(state: AddKnowledgeScreenState) {
        self.init(
            topic: nil,
            subjectId: nil,
            drafts: InMemoryAddDraftStore(),
            subjectPicker: AddKnowledgeSubjectPickerModel(
                subjects: state.subjects,
                selectedId: state.selectedSubjectId,
                loadFailed: state.subjectsLoadFailed,
                isExpanded: state.isSubjectTreeExpanded
            )
        )
        text = state.text
        pieces += state.extraPieces.map { AddKnowledgePiece(text: $0) }
        isSubmitting = state.isSubmitting
        activeDetections = state.activeDetections
        hasSent = state.hasSent
        summaryText = state.summaryText
        errorMessage = state.errorMessage
        canAddAnyway = state.canAddAnyway
        targetPhrases = state.targetPhrases
        isPhrasesExpanded = state.isPhrasesExpanded
    }
}
