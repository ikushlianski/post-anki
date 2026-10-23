import PostAnkiAPI
import SwiftUI

struct MacLearningListView: View {
    @State private var model = LearningListModel()
    @State private var selection: Set<String> = []
    @State private var history = MacHistoryCenter.shared.stack(for: "learning-list", of: LearningListItem.self)
    @State private var showsCapture = false
    @State private var droppedURL = ""
    @State private var declining: MacDestructiveRequest?

    private var selectedItems: [LearningListItem] {
        model.items.filter { selection.contains($0.id) }
    }

    private var decidable: [LearningListItem] {
        selectedItems.filter(\.isAwaitingDecision)
    }

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            stackContent
        }
    }

    private var stackContent: some View {
        content
            .navigationTitle("Learning list")
            .toolbar { toolbar }
            .navigationDestination(for: LearningListItem.self) { item in
                LearningListItemScreen(item: item, subjects: model.subjects) { model.replace($0) }
                    .id(item.id)
            }
            .sheet(isPresented: $showsCapture) {
                CaptureLearningItemSheet(subjects: model.subjects, initialURL: droppedURL) { item in
                    model.replace(item)
                    Task { await model.load() }
                }
                .macSheetMinSize(width: 440, height: 320)
            }
            .dropDestination(for: String.self) { texts, _ in
                guard let text = texts.first?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
                    return false
                }

                droppedURL = text
                showsCapture = true

                return true
            }
            .macConfirmDestructive($declining)
            .task { await reload() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, model.errorMessage != nil {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: model.errorMessage) {
                Task { await reload() }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else if model.items.isEmpty {
            ContentUnavailableView {
                Label("Nothing saved yet", systemImage: "text.badge.plus")
            } description: {
                Text("Save a link to start your learning list, or drop a link here.")
            } actions: {
                Button("Save a link") { openCapture() }
            }
        } else {
            list
        }
    }

    private var list: some View {
        List(selection: $selection) {
            if let message = model.actionMessage {
                Text(message).font(.caption).foregroundStyle(.red)
            }

            group("Needs your decision", model.awaiting)
            group("Parked", model.parked)
            group("Working on it", model.working)
            group("Done", model.done)
        }
        .contextMenu(forSelectionType: String.self) { ids in
            let items = model.items.filter { ids.contains($0.id) }

            if items.contains(where: \.isAwaitingDecision) {
                Button("Approve") { decide(items, approve: true) }
                Button("Decline", role: .destructive) { confirmDecline(items) }
            }

            if let url = items.first?.url, let link = WebLink.url(from: url) {
                Link("Open link", destination: link)
            }
        } primaryAction: { ids in
            if let item = model.items.first(where: { ids.contains($0.id) }) { history.open(item) }
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ items: [LearningListItem]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { item in
                    LearningListRow(item: item).tag(item.id)
                }
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem {
            Button { openCapture() } label: {
                Label("Save a link", systemImage: "plus")
            }
        }

        ToolbarItem {
            Button { decide(decidable, approve: true) } label: {
                Label("Approve", systemImage: "checkmark")
            }
            .disabled(decidable.isEmpty)
        }

        ToolbarItem {
            Button { confirmDecline(decidable) } label: {
                Label("Decline", systemImage: "xmark")
            }
            .disabled(decidable.isEmpty)
        }

        ToolbarItem {
            Button { Task { await reload() } } label: {
                Label("Reload", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r", modifiers: .command)
            .disabled(model.isLoading)
        }
    }

    private func openCapture() {
        droppedURL = ""
        showsCapture = true
    }


    private func confirmDecline(_ items: [LearningListItem]) {
        let targets = items.filter(\.isAwaitingDecision)

        guard !targets.isEmpty else { return }

        declining = MacDestructiveRequest(verb: "Decline", count: targets.count, noun: "item") {
            decide(targets, approve: false)
        }
    }

    private func decide(_ items: [LearningListItem], approve: Bool) {
        Task {
            for item in items.filter(\.isAwaitingDecision) {
                await model.decide(item, approve: approve)
            }
        }
    }

    private func reload() async {
        async let items: Void = model.load()
        async let subjects: Void = model.loadSubjects()
        await items
        await subjects
    }
}
