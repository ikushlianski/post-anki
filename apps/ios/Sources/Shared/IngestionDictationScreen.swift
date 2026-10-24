import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class IngestionDictationScreenModel {
    let topic: Topic?
    let subjectId: String?
    var text = ""
    var isSubmitting = false
    var activeDetections = 0
    var isDetecting: Bool { activeDetections > 0 }
    var errorMessage: String?
    var hasSent = false
    var showReview = false

    let subjectPicker = AddKnowledgeSubjectPickerModel()
    var canAddAnyway = false
    private var lastSent: KnowledgeSourceContent?

    var showsSubjectPicker: Bool { subjectId == nil }
    var effectiveSubjectId: String? { subjectId ?? subjectPicker.selectedId }

    var hasInput: Bool {
        isSubmitting || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    init(topic: Topic?, subjectId: String?) {
        self.topic = topic
        self.subjectId = subjectId
    }

    func submit() async {
        guard let content = AddKnowledgeInput.classify(text) else { return }

        await send(content, force: false)
    }

    func addAnyway() async {
        guard let content = lastSent else { return }

        await send(content, force: true)
    }

    private func send(_ content: KnowledgeSourceContent, force: Bool) async {
        guard !isSubmitting else { return }

        isSubmitting = true
        errorMessage = nil
        canAddAnyway = false
        lastSent = content

        if activeDetections == 0 {
            hasSent = false
        }

        do {
            _ = try await APIClient.addKnowledgeSource(content: content, subjectId: effectiveSubjectId, force: force)
            text = ""
            lastSent = nil
            hasSent = true
            isSubmitting = false
            activeDetections += 1
            defer { activeDetections -= 1 }
            try? await APIClient.detectKnowledgeBits()
        } catch {
            isSubmitting = false
            present(error)
        }
    }

    private func present(_ error: Error) {
        if let refusal = KnowledgeSourceRefusal.from(error) {
            if refusal == .subjectNotFound, subjectId != nil {
                errorMessage = "That course no longer exists. Go back and pick another."
            } else {
                errorMessage = refusal.message
            }

            canAddAnyway = refusal.canForce

            return
        }

        #if os(macOS)
        switch ProgressLoadError.from(error) {
        case .offline: errorMessage = "You're offline. Your text is still here, send it when you're back."
        case .unauthorized: errorMessage = "Add your access token in Settings, then send again."
        default: errorMessage = "Couldn't send that — try again."
        }
        #else
        errorMessage = "Couldn't send that — try again."
        #endif
    }
}

struct IngestionDictationScreen: View {
    @State private var model: IngestionDictationScreenModel

    init(topic: Topic? = nil, subjectId: String? = nil) {
        _model = State(initialValue: IngestionDictationScreenModel(topic: topic, subjectId: subjectId))
    }

    var body: some View {
        Form {
            if let topic = model.topic {
                Section {
                    Text("Topic: \(topic.title)")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if model.showsSubjectPicker {
                AddKnowledgeSubjectPicker(model: model.subjectPicker)
            }

            Section("Dictate what you're learning") {
                TextEditor(text: $model.text)
                    .frame(minHeight: 200)
            }

            Section {
                Button("Submit") {
                    Task { await model.submit() }
                }
                .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSubmitting)
                #if os(macOS)
                .keyboardShortcut(.return, modifiers: .command)
                #endif
            }

            if model.hasSent {
                Section {
                    Text(model.isDetecting
                        ? "Sent. Extracting items..."
                        : "Added. Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                    Button("Review new items") { model.showReview = true }
                        .disabled(model.isDetecting)
                }
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)

                    if model.canAddAnyway {
                        Button("Add anyway") {
                            Task { await model.addAnyway() }
                        }
                        .disabled(model.isSubmitting)
                    }
                }
            }
        }
        .navigationTitle("Add Knowledge")
        .reportsUnsentInput("add-knowledge", model.hasInput)
        .sheet(isPresented: $model.showReview) {
            PendingReviewScreen(onDone: { model.showReview = false })
                #if os(iOS)
                .presentationDragIndicator(.visible)
                #else
                .frame(minWidth: 480, minHeight: 520)
                #endif
        }
    }
}
