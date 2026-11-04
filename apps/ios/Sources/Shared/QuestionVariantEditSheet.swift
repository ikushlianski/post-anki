import PostAnkiAPI
import SwiftUI

struct QuestionVariantEditSheet: View {
    let initialContext: String
    let initialPrompt: String
    let initialAnswer: String
    let onSave: (String?, String, String) async -> String?

    @State private var context: String
    @State private var prompt: String
    @State private var answer: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var confirmingDiscard = false
    @Environment(\.dismiss) private var dismiss

    init(context: String?, prompt: String, answer: String, onSave: @escaping (String?, String, String) async -> String?) {
        let shownContext = context?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        initialContext = shownContext
        initialPrompt = prompt
        initialAnswer = answer
        self.onSave = onSave
        _context = State(initialValue: shownContext)
        _prompt = State(initialValue: prompt)
        _answer = State(initialValue: answer)
    }

    private var trimmedContext: String { context.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedPrompt: String { prompt.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedAnswer: String { answer.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var hasChanges: Bool {
        trimmedContext != initialContext || trimmedPrompt != initialPrompt || trimmedAnswer != initialAnswer
    }

    private var canSave: Bool { !trimmedPrompt.isEmpty && !trimmedAnswer.isEmpty && !isSaving && hasChanges }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CardTextArea(label: "Context", text: $context, minHeight: 44)
                    CardTextArea(label: "Question", text: $prompt)
                    CardTextArea(label: "Answer", text: $answer)
                }

                if let errorMessage {
                    Text(errorMessage).zoomFont(.caption).foregroundStyle(.red)
                }
            }
            .keyboardDismissal()
            .navigationTitle("Edit card")
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if hasChanges { confirmingDiscard = true } else { dismiss() }
                    }
                    .disabled(isSaving)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(isSaving || hasChanges)
            .confirmationDialog("Discard changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let savedContext = trimmedContext == initialContext ? nil : trimmedContext

        if let failure = await onSave(savedContext, trimmedPrompt, trimmedAnswer) {
            errorMessage = failure
        } else {
            dismiss()
        }
    }
}
