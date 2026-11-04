import PostAnkiAPI
import SwiftUI

struct NoteEditSheet: View {
    let kind: NoteEditKind
    let initialText: String
    let onSave: (String) async -> String?
    let onClose: () -> Void

    @State private var text: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var confirmingDiscard = false

    init(kind: NoteEditKind, text: String, onSave: @escaping (String) async -> String?, onClose: @escaping () -> Void) {
        self.kind = kind
        initialText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        self.onSave = onSave
        self.onClose = onClose
        _text = State(initialValue: text)
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasChanges: Bool { trimmed != initialText }
    private var validation: NoteValidation { NoteEditRules.validate(kind, text: text) }
    private var canSave: Bool { hasChanges && validation.isValid && !isSaving }

    private var label: String { kind == .cloze ? "Note with gaps" : "Title, then one step per line" }

    private var hint: String {
        kind == .cloze
            ? "Wrap each answer in a gap like {{c1::answer}}. Add a hint with {{c1::answer::hint}}."
            : "The first line is the title. Each following line is a step, in order."
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CardTextArea(label: label, text: $text, minHeight: 160)
                } footer: {
                    footer
                }

                if hasChanges, validation.isValid {
                    Section {
                        Text("Saving rebuilds this item's cards from the note.").zoomFont(.caption).foregroundStyle(.secondary)
                    }
                }

                if let errorMessage {
                    Text(errorMessage).zoomFont(.caption).foregroundStyle(.red)
                }
            }
            .keyboardDismissal()
            .navigationTitle(kind == .cloze ? "Edit cloze" : "Edit list")
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if hasChanges { confirmingDiscard = true } else { onClose() }
                    }
                    .disabled(isSaving)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(isSaving || hasChanges)
            .confirmationDialog("Discard changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { onClose() }
                Button("Keep editing", role: .cancel) {}
            }
        }
    }

    @ViewBuilder
    private var footer: some View {
        if let problem = validation.message {
            Text(problem).foregroundStyle(.red)
        } else if case .valid(let count) = validation {
            Text("\(count) \(count == 1 ? "card" : "cards") will be made. \(hint)")
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        if let failure = await onSave(trimmed) {
            errorMessage = failure
        } else {
            onClose()
        }
    }
}
