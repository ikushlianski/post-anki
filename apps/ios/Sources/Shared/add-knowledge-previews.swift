#if DEBUG
import PostAnkiAPI
import SwiftUI

private enum AddKnowledgePreviewData {
    static let subjects = [
        Subject(id: "web", name: "Webdev", description: nil, parentId: nil),
        Subject(id: "ai", name: "AI", description: nil, parentId: "web"),
        Subject(id: "css", name: "CSS", description: nil, parentId: "web"),
        Subject(id: "bio", name: "Biology", description: nil, parentId: nil)
    ]

    static let englishSubjects = subjects + [
        Subject(id: "en", name: "English", description: nil, parentId: nil),
        Subject(id: "idioms", name: "Idioms", description: nil, parentId: "en")
    ]

    static let prose = "Mitochondria make most of the energy a cell uses. They have their own DNA and divide on their own."
}

private func addKnowledgePreview(_ state: AddKnowledgeScreenState) -> some View {
    NavigationStack { IngestionDictationScreen(model: IngestionDictationScreenModel(state: state)) }
        .frame(minWidth: 380, minHeight: 640)
}

#Preview("Empty") {
    addKnowledgePreview(AddKnowledgeScreenState(subjects: AddKnowledgePreviewData.subjects))
}

#Preview("Typed text") {
    addKnowledgePreview(AddKnowledgeScreenState(text: AddKnowledgePreviewData.prose, subjects: AddKnowledgePreviewData.subjects))
}

#Preview("Pasted link") {
    addKnowledgePreview(AddKnowledgeScreenState(
        text: "https://developer.apple.com/documentation/swiftui",
        subjects: AddKnowledgePreviewData.subjects
    ))
}

#Preview("Subject chosen") {
    addKnowledgePreview(AddKnowledgeScreenState(
        text: AddKnowledgePreviewData.prose,
        subjects: AddKnowledgePreviewData.subjects,
        selectedSubjectId: "ai"
    ))
}

#Preview("Subject tree open") {
    addKnowledgePreview(AddKnowledgeScreenState(
        text: AddKnowledgePreviewData.prose,
        subjects: AddKnowledgePreviewData.subjects,
        selectedSubjectId: "ai",
        isSubjectTreeExpanded: true
    ))
}

#Preview("English phrases") {
    addKnowledgePreview(AddKnowledgeScreenState(
        text: "He kept his cards close to his chest.",
        subjects: AddKnowledgePreviewData.englishSubjects,
        selectedSubjectId: "idioms",
        isPhrasesExpanded: true,
        targetPhrases: ["close to his chest", ""]
    ))
}

#Preview("Submitting") {
    addKnowledgePreview(AddKnowledgeScreenState(
        text: AddKnowledgePreviewData.prose,
        isSubmitting: true,
        subjects: AddKnowledgePreviewData.subjects,
        selectedSubjectId: "ai"
    ))
}

#Preview("Extracting") {
    addKnowledgePreview(AddKnowledgeScreenState(
        activeDetections: 1,
        hasSent: true,
        subjects: AddKnowledgePreviewData.subjects,
        selectedSubjectId: "ai"
    ))
}

#Preview("Added with summary") {
    addKnowledgePreview(AddKnowledgeScreenState(
        hasSent: true,
        summaryText: "Created 6 items about how mitochondria produce and manage cell energy.",
        subjects: AddKnowledgePreviewData.subjects,
        selectedSubjectId: "ai"
    ))
}

#Preview("Error") {
    addKnowledgePreview(AddKnowledgeScreenState(
        text: AddKnowledgePreviewData.prose,
        errorMessage: "Couldn't send that. Check your connection and try again.",
        subjects: AddKnowledgePreviewData.subjects
    ))
}

#Preview("Error add anyway") {
    addKnowledgePreview(AddKnowledgeScreenState(
        text: AddKnowledgePreviewData.prose,
        errorMessage: "This looks like something you already added.",
        canAddAnyway: true,
        subjects: AddKnowledgePreviewData.subjects
    ))
}

#Preview("Subjects failed") {
    addKnowledgePreview(AddKnowledgeScreenState(text: AddKnowledgePreviewData.prose, subjectsLoadFailed: true))
}
#endif
