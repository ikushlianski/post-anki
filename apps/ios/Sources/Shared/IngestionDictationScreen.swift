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

    var hasInput: Bool {
        isSubmitting || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    init(topic: Topic?, subjectId: String?) {
        self.topic = topic
        self.subjectId = subjectId
    }

    func submit() async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSubmitting else { return }

        isSubmitting = true
        errorMessage = nil

        if activeDetections == 0 {
            hasSent = false
        }

        do {
            _ = try await APIClient.createKnowledgeSource(text: trimmed, subjectId: subjectId)
            text = ""
            hasSent = true
            isSubmitting = false
            activeDetections += 1
            defer { activeDetections -= 1 }
            try? await APIClient.detectKnowledgeBits()
        } catch {
            isSubmitting = false

            if case APIError.badStatus(_, "subject_not_found") = error {
                errorMessage = "That course no longer exists. Go back and pick another."
            } else {
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
                    Text(model.isDetecting ? "Sent. Extracting items..." : "Sent. New items appear in Review once extracted.")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                    Button("Review new items") { model.showReview = true }
                        .disabled(model.isDetecting)
                }
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
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
