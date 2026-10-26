import PostAnkiAPI
import SwiftUI

struct PendingReviewEditSheet: View {
    let bit: PendingReviewBit
    let onSave: (String?, String?, Bool, [PendingReviewVariantEdit]) async -> PendingReviewEditOutcome
    let onClose: (PendingReviewEditOutcome?) -> Void

    @State private var wording: String
    @State private var background: String
    @State private var variantTexts: [String: VariantText]
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var confirmingDiscard = false

    struct VariantText: Equatable {
        var prompt: String
        var answer: String
    }

    init(
        bit: PendingReviewBit,
        onSave: @escaping (String?, String?, Bool, [PendingReviewVariantEdit]) async -> PendingReviewEditOutcome,
        onClose: @escaping (PendingReviewEditOutcome?) -> Void
    ) {
        self.bit = bit
        self.onSave = onSave
        self.onClose = onClose
        _wording = State(initialValue: bit.body)
        _background = State(initialValue: bit.background ?? "")
        _variantTexts = State(
            initialValue: Dictionary(
                bit.variants.map { ($0.id, VariantText(prompt: $0.prompt, answer: $0.answer)) },
                uniquingKeysWith: { first, _ in first }
            )
        )
    }

    private var trimmedBody: String { wording.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedBackground: String { background.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var bodyChanged: Bool { trimmedBody != bit.body }
    private var backgroundChanged: Bool { trimmedBackground != (bit.background ?? "") }

    private var variantEdits: [PendingReviewVariantEdit] {
        bit.variants.compactMap { variant in
            guard let text = variantTexts[variant.id] else { return nil }

            let prompt = text.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
            let answer = text.answer.trimmingCharacters(in: .whitespacesAndNewlines)

            guard prompt != variant.prompt || answer != variant.answer, !prompt.isEmpty, !answer.isEmpty else { return nil }

            return PendingReviewVariantEdit(id: variant.id, prompt: prompt, answer: answer)
        }
    }

    private var hasChanges: Bool {
        bodyChanged || backgroundChanged || bit.variants.contains { variant in
            guard let text = variantTexts[variant.id] else { return false }

            return text.prompt != variant.prompt || text.answer != variant.answer
        }
    }

    private var canSave: Bool {
        guard !trimmedBody.isEmpty, !isSaving else { return false }

        return bodyChanged || backgroundChanged || !variantEdits.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CardTextArea(label: "Wording", text: $wording)
                } footer: {
                    if bodyChanged {
                        Text("Changing the wording regenerates its questions. Question edits are not saved with it.")
                    }
                }

                Section {
                    CardTextArea(label: "Background", text: $background, minHeight: 70)
                }

                ForEach(bit.variants) { variant in
                    Section {
                        CardTextArea(label: "Question", text: binding(for: variant, \.prompt))
                        CardTextArea(label: "Answer", text: binding(for: variant, \.answer))
                    }
                    .disabled(bodyChanged)
                }

                if let errorMessage {
                    Text(errorMessage).zoomFont(.caption).foregroundStyle(.red)
                }
            }
            .keyboardDismissal()
            .navigationTitle("Edit item")
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if hasChanges { confirmingDiscard = true } else { onClose(nil) }
                    }
                    .disabled(isSaving)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(isSaving || hasChanges)
            .confirmationDialog("Discard changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { onClose(nil) }
                Button("Keep editing", role: .cancel) {}
            }
        }
    }

    private func binding(for variant: PendingReviewVariant, _ path: WritableKeyPath<VariantText, String>) -> Binding<String> {
        Binding(
            get: { variantTexts[variant.id]?[keyPath: path] ?? "" },
            set: { variantTexts[variant.id]?[keyPath: path] = $0 }
        )
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let outcome = await onSave(
            bodyChanged ? trimmedBody : nil,
            trimmedBackground.isEmpty ? nil : trimmedBackground,
            backgroundChanged,
            variantEdits
        )

        switch outcome {
        case .saved, .gone: onClose(outcome)
        case .failed(let message): errorMessage = message
        }
    }
}
