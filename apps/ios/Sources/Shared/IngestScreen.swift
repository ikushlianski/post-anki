import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class IngestScreenModel {
    var queue: [NextQuestionVariant] = []
    var userAnswer = ""
    var feedback: String?
    var isLoading = false
    var errorMessage: String?
    var failure: ProgressLoadError?
    private(set) var isSubmitting = false
    var drafts: UnsentDraftStore?

    private var draftKey: String? {
        current.map { UnsentDraftStore.key("ingest", $0.variantId) }
    }

    var current: NextQuestionVariant? { queue.first }

    var hasInput: Bool {
        isSubmitting || !userAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        feedback = nil
        failure = nil

        do {
            queue = try await APIClient.nextQuestionVariants()
        } catch {
            errorMessage = "Couldn't load knowledge bits to confirm."
            failure = ProgressLoadError.from(error)
        }

        isLoading = false
        restoreDraft()
    }

    func restoreDraft() {
        guard userAnswer.isEmpty, let key = draftKey, let saved = drafts?.text(for: key) else { return }

        userAnswer = saved
    }

    func saveDraft() {
        guard let key = draftKey, feedback == nil else { return }

        drafts?.set(userAnswer, for: key)
    }

    func submitAnswer() async {
        guard let current, !isSubmitting, feedback == nil,
              !userAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let result = try await APIClient.gradeAnswer(
                variantId: current.variantId,
                userAnswer: userAnswer
            )

            if result.ok {
                feedback = result.feedback

                if let key = draftKey { drafts?.clear(key) }
            } else {
                errorMessage = "Couldn't grade that answer."
            }
        } catch {
            errorMessage = "Couldn't grade that answer."
        }
    }

    func nextBit() {
        if let key = draftKey { drafts?.clear(key) }

        if !queue.isEmpty {
            queue.removeFirst()
        }

        userAnswer = ""
        feedback = nil
        errorMessage = nil
    }
}

struct IngestScreen: View {
    @State private var model = IngestScreenModel()

    var body: some View {
        NavigationStack {
            Group {
                if let current = model.current {
                    Form {
                        Section("Knowledge bit") {
                            Text(current.bitBody)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        Section(current.prompt) {
                            TextField("Your answer", text: $model.userAnswer, axis: .vertical)
                        }

                        if let feedback = model.feedback {
                            Section("Feedback") {
                                Text(feedback)
                            }

                            Button("Next") { model.nextBit() }
                        } else {
                            Button("Submit") { Task { await model.submitAnswer() } }
                                .disabled(model.userAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }

                        if let errorMessage = model.errorMessage {
                            Text(errorMessage)
                                .foregroundStyle(.red)
                        }
                    }
                } else if !model.isLoading {
                    ContentUnavailableView(
                        "Nothing to confirm",
                        systemImage: "checkmark.circle",
                        description: Text("New knowledge bits will show up here once generated.")
                    )
                }
            }
            .navigationTitle("Ingest")
            .refreshable { await model.load() }
            .task { await model.load() }
        }
    }
}
