import PostAnkiAPI
import SwiftUI

struct TopicQuizScreen: View {
    let topic: Topic
    @State private var model: TopicQuizModel
    @State private var confirmsNew = false

    init(topic: Topic) {
        self.topic = topic
        _model = State(initialValue: TopicQuizModel(topicId: topic.id))
    }

    var body: some View {
        List {
            content
        }
        .navigationTitle("Quick test")
        .inlineNavigationTitle()
        .refreshable { await model.load() }
        .task { await model.load() }
        .confirmationDialog("Start a new quiz?", isPresented: $confirmsNew, titleVisibility: .visible) {
            Button("New quiz", role: .destructive) {
                Task { await model.generate(regenerate: true) }
            }
        } message: {
            Text("This discards the current practice session.")
        }
    }

    @ViewBuilder
    private var content: some View {
        if model.isGenerating {
            HStack {
                ProgressView()
                Text("Generating questions...")
            }
        } else if !model.hasLoaded && model.errorMessage == nil {
            ProgressView()
        } else if model.session == nil {
            emptyState
        } else if let question = model.current {
            questionView(question)
        } else {
            completeView
        }

        if let message = model.errorMessage {
            Section {
                Text(message).foregroundStyle(.red)

                if !model.isRemoved {
                    Button("Try again") { Task { await model.load() } }
                }
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if !model.isRemoved {
            Section {
                Text("No quiz yet for this topic.")
                    .foregroundStyle(.secondary)
                Button("Generate questions") {
                    Task { await model.generate(regenerate: false) }
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var completeView: some View {
        Section {
            let session = model.session
            Text("Quiz complete: \(session?.correct ?? 0)/\(session?.total ?? 0).")
                .zoomFont(.headline)
            Button("New quiz") { confirmsNew = true }
        }
    }

    @ViewBuilder
    private func questionView(_ question: QuizQuestion) -> some View {
        let session = model.session
        let position = (session?.questions.firstIndex { $0.id == question.id } ?? 0) + 1

        Section {
            HStack {
                Text("Question \(position)/\(session?.total ?? 0)")
                Spacer()
                Text("Score \(session?.correct ?? 0)/\(session?.answered ?? 0)")
            }
            .zoomFont(.caption)
            .foregroundStyle(.secondary)

            Text(question.prompt).zoomFont(.headline)

            if question.isMulti && model.lastResult == nil {
                Text("Select all that apply").zoomFont(.caption).foregroundStyle(.secondary)
            }
        }

        Section {
            ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                QuizOptionRow(
                    option: option,
                    index: index,
                    question: question,
                    isSelected: model.selectedMulti.contains(index),
                    isDisabled: model.isSubmitting || model.lastResult != nil
                ) {
                    if question.isMulti {
                        model.toggle(index)
                    } else {
                        Task { await model.choose(index) }
                    }
                }
            }
        }

        if question.isMulti && model.lastResult == nil {
            Button("Submit") { Task { await model.submitMulti() } }
                .macDefaultAction()
                .disabled(model.selectedMulti.isEmpty || model.isSubmitting)
        }

        if let result = model.lastResult {
            resultView(result)
        }
    }

    private func resultView(_ result: QuizAnswerResult) -> some View {
        Section {
            Text(result.outcome == "pass" ? "Correct." : "Not quite.")
                .zoomFont(.headline)
                .foregroundStyle(result.outcome == "pass" ? .green : .red)

            if let mastery = result.gapMastery, mastery.justMastered {
                Text("Resolved: \(mastery.label)")
            }

            Button("Next") { Task { await model.next() } }
                .macDefaultAction()
        }
    }
}

struct QuizOptionRow: View {
    let option: String
    let index: Int
    let question: QuizQuestion
    let isSelected: Bool
    let isDisabled: Bool
    let action: () -> Void

    private var picked: Set<Int> {
        if let indexes = question.answeredIndexes { return Set(indexes) }

        return question.answeredIndex.map { [$0] } ?? []
    }

    private var correct: Set<Int> {
        if let indexes = question.correctAnswerIndexes { return Set(indexes) }

        return question.correctAnswerIndex.map { [$0] } ?? []
    }

    private var tint: Color? {
        guard question.isAnswered else { return nil }
        if correct.contains(index) { return .green }
        if picked.contains(index) { return .red }

        return nil
    }

    private var explanation: String? {
        guard question.isAnswered, let list = question.optionExplanations, list.indices.contains(index) else {
            return nil
        }

        return list[index].text
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            Button(action: action) {
                HStack {
                    if question.isMulti && !question.isAnswered {
                        Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                            .accessibilityHidden(true)
                    }

                    Text(option)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .foregroundStyle(tint ?? .primary)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(question.isMulti && isSelected ? .isSelected : [])
            .macDigitShortcut(index, isEnabled: !isDisabled)
            .disabled(isDisabled)

            if let explanation {
                Text(explanation).zoomFont(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private extension View {
    @ViewBuilder
    func macDefaultAction() -> some View {
        #if os(macOS)
        keyboardShortcut(.defaultAction)
        #else
        self
        #endif
    }

    @ViewBuilder
    func macDigitShortcut(_ index: Int, isEnabled: Bool) -> some View {
        #if os(macOS)
        if isEnabled, index < 4, let key = "1234".dropFirst(index).first {
            keyboardShortcut(KeyEquivalent(key), modifiers: [])
        } else {
            self
        }
        #else
        self
        #endif
    }
}
