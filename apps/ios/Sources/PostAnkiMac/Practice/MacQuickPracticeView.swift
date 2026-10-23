import PostAnkiAPI
import SwiftUI

struct MacQuickPracticeView: View {
    @State private var model: IngestScreenModel = {
        let model = IngestScreenModel()
        model.drafts = .shared

        return model
    }()
    @State private var hasLoaded = false
    @FocusState private var answerFocused: Bool

    private var trimmedAnswer: String {
        model.userAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        content
            .navigationTitle("Quick practice")
            .toolbar {
                ToolbarItem {
                    Button {
                        Task { await reload() }
                    } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
                }
            }
            .reportsUnsentInput("quick-practice", model.hasInput)
            .task { await reload() }
    }

    private func reload() async {
        await model.load()
        hasLoaded = true
        answerFocused = true
    }

    @ViewBuilder
    private var content: some View {
        if let current = model.current {
            practiceForm(current)
        } else if let failure = model.failure {
            MacLoadStateView(failure: failure) { Task { await reload() } }
        } else if !hasLoaded || model.isLoading {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            MacEmptyStateView(
                title: "No questions to practice",
                systemImage: "checkmark.circle",
                message: "Questions appear here once you have knowledge to practice."
            )
        }
    }

    private func advance() {
        model.nextBit()
        answerFocused = true
    }

    private func practiceForm(_ current: NextQuestionVariant) -> some View {
        Form {
            Section("Knowledge bit") {
                Text(current.bitBody)
                    .zoomFont(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section(current.prompt) {
                TextField("Your answer", text: $model.userAnswer, axis: .vertical)
                    .focused($answerFocused)
                    .onKeyPress(keys: [.return]) { press in
                        if press.modifiers.contains(.shift) {
                            model.userAnswer += "\n"
                        } else if model.feedback == nil {
                            Task { await model.submitAnswer() }
                        } else {
                            advance()
                        }

                        return .handled
                    }
            }

            if let feedback = model.feedback {
                Section("Feedback") {
                    Text(feedback)
                }

                Button("Next", action: advance)
                .keyboardShortcut(.defaultAction)
            } else {
                Button("Submit") { Task { await model.submitAnswer() } }
                    .disabled(trimmedAnswer.isEmpty)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .formStyle(.grouped)
        .onChange(of: model.userAnswer) { model.saveDraft() }
    }
}
