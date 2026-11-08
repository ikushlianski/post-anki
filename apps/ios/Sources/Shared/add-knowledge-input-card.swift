import SwiftUI

struct AddKnowledgeInputCard: View {
    @Bindable var model: IngestionDictationScreenModel
    let submit: () -> Void

    private var canSubmit: Bool {
        !model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !model.isSubmitting
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 14) {
            Text("Add knowledge")
                .zoomFont(.title3)
                .fontWeight(.semibold)

            if let topic = model.topic {
                Text("Topic: \(topic.title)")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            if model.showsSubjectPicker {
                AddKnowledgeSubjectFields(model: model.subjectPicker)
            }

            if model.showsTargetPhrases {
                ZoomVStack(alignment: .leading, spacing: 6) {
                    Text("Target phrases")
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                    TargetPhrasesFields(phrases: $model.targetPhrases)
                }
            }

            ZoomVStack(alignment: .leading, spacing: 6) {
                Text("Dictate what you're learning")
                    .zoomFont(.subheadline)
                    .foregroundStyle(.secondary)
                editor
                paste
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .zoomFont(.callout)
                    .foregroundStyle(.red)

                if model.canAddAnyway {
                    Button("Add anyway") { Task { await model.addAnyway() } }
                        .disabled(model.isSubmitting)
                }
            }

            submitButton
        }
        .zoomPadding(16)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.secondary.opacity(0.25)))
    }

    private var editor: some View {
        TextEditor(text: $model.text)
            .frame(minHeight: 200)
            .scrollContentBackground(.hidden)
            .padding(6)
            .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            .overlay(alignment: .topLeading) {
                if model.text.isEmpty {
                    Text(AddKnowledgeInput.placeholder)
                        .foregroundStyle(.secondary)
                        .padding(.top, 14)
                        .padding(.leading, 11)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
    }

    @ViewBuilder
    private var paste: some View {
        #if os(iOS)
        PasteButton(payloadType: String.self) { strings in
            guard let pasted = strings.first else { return }

            Task { @MainActor in model.text = AddKnowledgeDraft.pasting(pasted, into: model.text) }
        }
        .accessibilityIdentifier("add-knowledge-paste")
        #endif
    }

    private var submitButton: some View {
        Button(action: submit) {
            ZStack {
                Text("Submit").zoomFont(.headline).opacity(model.isSubmitting ? 0 : 1)

                if model.isSubmitting { ProgressView().controlSize(.small) }
            }
            .frame(maxWidth: .infinity)
            .zoomPadding(.vertical, 10)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!canSubmit)
        .accessibilityLabel("Submit")
        .accessibilityIdentifier("add-knowledge-submit")
        .optionalSubmitShortcut()
    }
}

private extension View {
    @ViewBuilder
    func optionalSubmitShortcut() -> some View {
        #if os(macOS)
        keyboardShortcut(.return, modifiers: .command)
        #else
        self
        #endif
    }
}
