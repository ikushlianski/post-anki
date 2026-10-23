import PostAnkiAPI
import SwiftUI

struct MacOpenQuestionsView: View {
    @State private var model = OpenQuestionsModel()
    @State private var selection: OpenQuestion.ID?
    @State private var resolving: OpenQuestion?
    @State private var dismissing: MacDestructiveRequest?

    private var selected: OpenQuestion? {
        model.items.first { $0.id == selection }
    }

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 0) {
            Picker("Status", selection: $model.filter) {
                ForEach(OpenQuestionFilter.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding()

            if let message = model.actionMessage {
                Text(message).font(.caption).foregroundStyle(.red).padding(.bottom, 4)
            }

            content
        }
        .navigationTitle("Open questions")
        .navigationSubtitle(model.hasLoaded ? "\(model.totalCount) \(model.filter.rawValue)" : "")
        .toolbar {
            ToolbarItem {
                Button { resolving = selected } label: {
                    Label("Answer", systemImage: "checkmark.bubble")
                }
                .disabled(selected?.status != "open")
            }

            ToolbarItem {
                Button { dismiss(selected) } label: {
                    Label("Dismiss", systemImage: "xmark.bin")
                }
                .disabled(selected?.status != "open")
            }

            ToolbarItem {
                Button { Task { await model.load() } } label: {
                    Label("Reload", systemImage: "arrow.clockwise")
                }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(model.isLoading)
            }
        }
        .sheet(item: $resolving) { question in
            ResolveQuestionSheet(question: question) { answer in
                await model.resolve(question, as: .answered, answerText: answer)
            }
            .macSheetMinSize(width: 460, height: 340)
        }
        .macConfirmDestructive($dismissing)
        .task(id: model.filter) { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if let loadError = model.loadError, model.items.isEmpty {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: loadError) {
                Task { await model.load() }
            }
        } else if !model.hasLoaded {
            ProgressView().frame(maxHeight: .infinity)
        } else if model.items.isEmpty {
            MacEmptyStateView(
                title: model.filter == .open ? "No open questions" : "Nothing here yet",
                systemImage: "questionmark.bubble",
                message: model.filter == .open
                    ? "Questions you flag during web study sessions appear here."
                    : "Resolved questions will be listed here."
            )
        } else {
            List(selection: $selection) {
                ForEach(model.items) { question in
                    OpenQuestionRow(question: question).tag(question.id)
                }
            }
            .contextMenu(forSelectionType: OpenQuestion.ID.self) { ids in
                if let question = model.items.first(where: { ids.contains($0.id) }), question.status == "open" {
                    Button("Answer…") { resolving = question }
                    Button("Dismiss", role: .destructive) { dismiss(question) }
                }
            } primaryAction: { ids in
                if let question = model.items.first(where: { ids.contains($0.id) }), question.status == "open" {
                    resolving = question
                }
            }
            .onDeleteCommand { dismiss(selected) }
        }
    }

    private func dismiss(_ question: OpenQuestion?) {
        guard let question, question.status == "open" else { return }


        dismissing = MacDestructiveRequest(verb: "Dismiss", count: 1, noun: "question") {
            Task { _ = await model.resolve(question, as: .dismissed) }
        }

    }
}
