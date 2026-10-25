import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class ExerciseScreenModel {
    let topics: [Topic]
    var currentTopicIndex = 0
    var queue: [NextQuestionVariant] = []
    var userAnswer = ""
    var feedback: String?
    var isLoading = true
    var errorMessage: String?
    var finished = false
    var isOffline = false

    private var startTask: Task<Void, Never>?
    private(set) var isSubmitting = false
    private var isAdvancing = false
    private var loadWasCancelled = false

    var current: NextQuestionVariant? { queue.first }
    var currentTopic: Topic? {
        topics.indices.contains(currentTopicIndex) ? topics[currentTopicIndex] : nil
    }

    init(topics: [Topic]) {
        self.topics = topics
    }

    func start() {
        guard startTask == nil else { return }

        isLoading = true

        startTask = Task { [weak self] in
            await PendingAnswerQueue.shared.flush()

            guard let self else { return }

            if topics.isEmpty {
                isLoading = false
                finished = true
            } else {
                await loadCurrentTopic()
            }

            if loadWasCancelled {
                startTask = nil
            }
        }
    }

    func retry() async {
        guard !isLoading else { return }

        await loadCurrentTopic()
    }

    private func loadCurrentTopic() async {
        guard let currentTopic else {
            isLoading = false
            finished = true
            return
        }

        isLoading = true
        errorMessage = nil
        feedback = nil

        isOffline = false
        loadWasCancelled = false

        var failed = false

        do {
            queue = try await APIClient.nextQuestionVariants(topicId: currentTopic.id)

            if !queue.isEmpty {
                VariantCache.save(queue, topicId: currentTopic.id)
            }
        } catch is CancellationError {
            loadWasCancelled = true
            errorMessage = "Loading was interrupted."
        } catch let error as URLError where error.code == .cancelled {
            loadWasCancelled = true
            errorMessage = "Loading was interrupted."
        } catch is URLError {
            let cached = VariantCache.load(topicId: currentTopic.id)

            if cached.isEmpty {
                errorMessage = "Couldn't connect to the server and no saved questions are available."
                failed = true
            } else {
                queue = cached
                isOffline = true
            }
        } catch {
            errorMessage = "Couldn't load exercises for this topic."
            failed = true
        }

        isLoading = false

        if loadWasCancelled { return }

        if queue.isEmpty && !failed {
            await advanceTopic()
        }
    }

    func submitAnswer() async {
        guard let current, !isSubmitting, !userAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
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
            } else {
                errorMessage = "Couldn't grade that answer."
            }
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch is URLError {
            let saved = await PendingAnswerQueue.shared.enqueue(
                variantId: current.variantId,
                userAnswer: userAnswer
            )

            if saved {
                feedback = "Saved. It will be graded when you're back online."
            } else {
                errorMessage = "Couldn't grade that answer."
            }
        } catch {
            errorMessage = "Couldn't grade that answer."
        }
    }

    func nextBit() async {
        guard feedback != nil, !isAdvancing else { return }

        isAdvancing = true
        defer { isAdvancing = false }

        if !queue.isEmpty {
            queue.removeFirst()

            if let currentTopic {
                VariantCache.save(queue, topicId: currentTopic.id)
            }
        }

        userAnswer = ""
        feedback = nil
        errorMessage = nil

        if queue.isEmpty {
            await advanceTopic()
        }
    }

    private func advanceTopic() async {
        currentTopicIndex += 1
        await loadCurrentTopic()
    }
}

struct ExerciseScreen: View {
    @State private var model: ExerciseScreenModel
    @FocusState private var answerFocused: Bool

    init(topics: [Topic]) {
        _model = State(initialValue: ExerciseScreenModel(topics: topics))
    }

    var body: some View {
        Group {
            if let current = model.current {
                Form {
                    if let currentTopic = model.currentTopic {
                        Section {
                            Text(currentTopic.title)
                                .zoomFont(.caption)
                                .foregroundStyle(.secondary)

                            if model.isOffline {
                                Text("Couldn't connect — showing saved questions")
                                    .zoomFont(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }

                    Section("Knowledge bit") {
                        Text(current.bitBody)
                            .zoomFont(.subheadline)
                            .foregroundStyle(.secondary)

                        NavigationLink {
                            KnowledgeItemChatScreen(knowledgeBitId: current.knowledgeBitId, bitBody: current.bitBody)
                        } label: {
                            Label("Discuss this", systemImage: "bubble.left.and.bubble.right")
                        }
                    }

                    Section(current.prompt) {
                        TextField("Your answer", text: $model.userAnswer, axis: .vertical)
                            .focused($answerFocused)
                            #if os(macOS)
                            .onKeyPress(keys: [.return]) { press in
                                if press.modifiers.contains(.shift) {
                                    model.userAnswer += "\n"
                                } else if model.feedback == nil {
                                    Task { await model.submitAnswer() }
                                }

                                return .handled
                            }
                            #endif
                    }

                    if let feedback = model.feedback {
                        Section("Feedback") {
                            Text(feedback)
                        }

                        Button("Next") { Task { await model.nextBit() } }
                            #if os(macOS)
                            .keyboardShortcut(.defaultAction)
                            #endif
                    } else {
                        Button("Submit") { Task { await model.submitAnswer() } }
                            .disabled(model.userAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSubmitting)
                    }

                    if let errorMessage = model.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
            } else if model.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage = model.errorMessage {
                ContentUnavailableView {
                    Label("Couldn't load exercises", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Try again") { Task { await model.retry() } }
                }
            } else if model.finished {
                ContentUnavailableView(
                    "Nothing left to practice",
                    systemImage: "checkmark.seal",
                    description: Text("You've worked through every topic's queue for this course.")
                )
            }
        }
        .navigationTitle("Exercise")
        .task { model.start() }
        #if os(macOS)
        .onChange(of: model.current?.variantId, initial: true) { _, _ in
            if model.feedback == nil { answerFocused = true }
        }
        #endif
    }
}
