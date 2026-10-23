import SwiftUI

struct CourseEditTitleSheet: View {
    let heading: String
    let onSave: (String) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(heading: String, initialTitle: String = "", onSave: @escaping (String) async -> String?) {
        self.heading = heading
        self.onSave = onSave
        _title = State(initialValue: initialTitle)
    }

    private var trimmed: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func save() {
        guard !trimmed.isEmpty, !isSaving else { return }

        Task {
            isSaving = true
            errorMessage = nil

            if let failure = await onSave(trimmed) {
                errorMessage = failure
            } else {
                dismiss()
            }

            isSaving = false
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                    #if os(macOS)
                    .onSubmit { save() }
                    #endif

                SheetErrorText(message: errorMessage)
            }
            .navigationTitle(heading)
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(trimmed.isEmpty || isSaving)
                }
            }
        }
    }
}

struct CourseEditCommentSheet: View {
    let heading: String
    let onSend: (String) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var isSending = false
    @State private var saved = false
    @State private var errorMessage: String?

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Your comment", text: $text, axis: .vertical)
                    .lineLimit(4...10)

                if saved {
                    Text("Comment saved.").foregroundStyle(.green)
                }

                SheetErrorText(message: errorMessage)
            }
            .navigationTitle(heading)
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(saved ? "Done" : "Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task {
                            isSending = true
                            errorMessage = nil

                            let failure = await onSend(trimmed)

                            saved = failure == nil
                            errorMessage = failure

                            if saved { text = "" }

                            isSending = false
                        }
                    }
                    #if os(macOS)
                    .keyboardShortcut(.return, modifiers: .command)
                    #endif
                    .disabled(trimmed.isEmpty || isSending)
                }
            }
        }
    }
}
