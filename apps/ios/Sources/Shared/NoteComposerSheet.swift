import PostAnkiAPI
import SwiftUI

struct NoteComposerSheet: View {
    let topic: Topic
    let onSaved: (Note) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var noteBody = ""
    @State private var isHighlight = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var trimmed: String {
        noteBody.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Write a note…", text: $noteBody, axis: .vertical)
                        .lineLimit(4...12)
                    Toggle("Highlight", isOn: $isHighlight)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
            .navigationTitle("New note")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        #if os(macOS)
                        .keyboardShortcut(.return, modifiers: .command)
                        #endif
                        .disabled(trimmed.isEmpty || isSaving)
                }
            }
        }
        .macSheetMinSize()
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        do {
            let note = try await APIClient.createTopicNote(
                topicId: topic.id,
                body: trimmed,
                isHighlight: isHighlight
            )
            onSaved(note)
            dismiss()
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This topic was removed.")
        }

        isSaving = false
    }
}
