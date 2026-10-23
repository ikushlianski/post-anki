import PostAnkiAPI
import SwiftUI

enum OpenQuestionFilter: String, CaseIterable, Identifiable {
    case open
    case answered
    case dismissed

    var id: String { rawValue }

    var title: String { rawValue.capitalized }
}

@Observable
@MainActor
final class OpenQuestionsModel {
    var filter: OpenQuestionFilter = .open
    var items: [OpenQuestion] = []
    var totalCount = 0
    var isLoading = false
    var hasLoaded = false
    var loadError: String?
    var failureKind: ProgressLoadError?
    var actionMessage: String?

    func load() async {
        let requested = filter
        isLoading = true
        loadError = nil
        failureKind = nil

        do {
            let page = try await APIClient.openQuestions(status: requested.rawValue)
            guard requested == filter else { return }

            items = page.items
            totalCount = page.totalCount
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            if requested == filter { isLoading = false }

            return
        } catch {
            guard requested == filter else { return }

            loadError = StudyToolsError.message(for: error)
            failureKind = ProgressLoadError.from(error)
        }

        isLoading = false
    }

    func resolve(
        _ question: OpenQuestion,
        as resolution: OpenQuestionResolution,
        answerText: String? = nil
    ) async -> Bool {
        actionMessage = nil

        do {
            _ = try await APIClient.resolveOpenQuestion(
                id: question.id,
                status: resolution,
                answerText: answerText
            )
            remove(question)

            return true
        } catch {
            if case APIError.badStatus(404, _) = error {
                remove(question)
                actionMessage = "Already resolved elsewhere"

                return true
            }

            actionMessage = StudyToolsError.message(for: error)

            return false
        }
    }

    private func remove(_ question: OpenQuestion) {
        if items.contains(where: { $0.id == question.id }) {
            totalCount = max(0, totalCount - 1)
        }

        items.removeAll { $0.id == question.id }
    }
}

struct OpenQuestionsScreen: View {
    @State private var model = OpenQuestionsModel()
    @State private var resolving: OpenQuestion?

    var body: some View {
        List {
            Section {
                Picker("Status", selection: $model.filter) {
                    ForEach(OpenQuestionFilter.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)

                if model.hasLoaded {
                    Text("\(model.totalCount) \(model.filter.rawValue)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let message = model.actionMessage {
                Text(message)
                    .foregroundStyle(.red)
            }

            content
        }
        .navigationTitle("Open questions")
        .refreshable { await model.load() }
        .task(id: model.filter) { await model.load() }
        .sheet(item: $resolving) { question in
            ResolveQuestionSheet(question: question) { answer in
                await model.resolve(question, as: .answered, answerText: answer)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let loadError = model.loadError, model.items.isEmpty {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(loadError)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else if model.items.isEmpty {
            Text(emptyText)
                .foregroundStyle(.secondary)
        } else {
            ForEach(model.items) { question in
                row(question)
            }
        }
    }

    private var emptyText: String {
        model.filter == .open
            ? "No open questions. Questions you flag during web study sessions appear here."
            : "Nothing here yet."
    }

    @ViewBuilder
    private func row(_ question: OpenQuestion) -> some View {
        let content = OpenQuestionRow(question: question)

        if question.status == "open" {
            Button { resolving = question } label: { content }
                .buttonStyle(.plain)
                .swipeActions {
                    Button("Dismiss", role: .destructive) {
                        Task { _ = await model.resolve(question, as: .dismissed) }
                    }
                }
        } else {
            content
        }
    }
}

struct OpenQuestionRow: View {
    let question: OpenQuestion

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(question.questionText)

            HStack(spacing: 6) {
                Text(question.topicTitle ?? "No topic")

                if let date = DueReviewModel.nextDueText(question.createdAt) {
                    Text(date)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let answer = question.answerText {
                Text(answer)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let resolvedAt = question.resolvedAt, let date = DueReviewModel.nextDueText(resolvedAt) {
                Text("Resolved \(date)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct ResolveQuestionSheet: View {
    static let maxAnswerLength = 2000

    let question: OpenQuestion
    let onAnswer: (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var answer = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Question") {
                    Text(question.questionText)
                }

                Section("Answer (optional)") {
                    TextField("What did you find out?", text: $answer, axis: .vertical)
                        .lineLimit(3...8)
                        .onChange(of: answer) { _, value in
                            if value.count > Self.maxAnswerLength {
                                answer = String(value.prefix(Self.maxAnswerLength))
                            }
                        }
                    Text("\(answer.count)/\(Self.maxAnswerLength)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Resolve")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Mark answered") {
                        Task {
                            isSaving = true
                            let done = await onAnswer(answer)
                            isSaving = false

                            if done { dismiss() }
                        }
                    }
                    .disabled(isSaving)
                    .submitShortcut()
                }
            }
        }
    }
}
