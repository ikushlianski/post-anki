import SwiftUI

struct QuestionVariantEditSheet: View {
    let initialPrompt: String
    let initialAnswer: String
    let onSave: (String, String) async -> String?

    @State private var prompt: String
    @State private var answer: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    init(prompt: String, answer: String, onSave: @escaping (String, String) async -> String?) {
        initialPrompt = prompt
        initialAnswer = answer
        self.onSave = onSave
        _prompt = State(initialValue: prompt)
        _answer = State(initialValue: answer)
    }

    private var trimmedPrompt: String { prompt.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedAnswer: String { answer.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var canSave: Bool {
        !trimmedPrompt.isEmpty && !trimmedAnswer.isEmpty && !isSaving
            && (trimmedPrompt != initialPrompt || trimmedAnswer != initialAnswer)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Question") { TextField("Question", text: $prompt, axis: .vertical) }
                Section("Answer") { TextField("Answer", text: $answer, axis: .vertical) }

                if let errorMessage {
                    Text(errorMessage).zoomFont(.caption).foregroundStyle(.red)
                }
            }
            .navigationTitle("Edit card")
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(isSaving)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        if let failure = await onSave(trimmedPrompt, trimmedAnswer) {
            errorMessage = failure
        } else {
            dismiss()
        }
    }
}
