import PostAnkiAPI
import SwiftUI

enum MacKnowledgeRoute: Hashable {
    case item(KnowledgeOverviewItem)
    case suspended
    case chatQueue
}

struct MacKnowledgeView: View {
    @State private var model = KnowledgeListModel()
    @State private var history = MacHistoryCenter.shared.stack(for: "knowledge", of: MacKnowledgeRoute.self)
    @State private var confirmingDelete = false
    @State private var choosingSubject = false
    @State private var chatCounts = ChatQueueCountStore.shared

    var body: some View {
        @Bindable var model = model

        NavigationStack(path: history.pathBinding) {
            content
                .navigationTitle("Knowledge")
                .searchable(text: $model.query, prompt: "Search items")
                .toolbar { toolbar }
                .navigationDestination(for: MacKnowledgeRoute.self) { route in
                    switch route {
                    case .item(let item):
                        KnowledgeItemDetailScreen(
                            item: item,
                            subjectName: model.subjectName(for: item.subjectId),
                            onStateChange: { state in model.update(item.id, state: state) },
                            onDeleted: { model.remove(item.id) },
                            onMoved: { _ in Task { await model.reload() } }
                        )
                        .id(item.id)
                    case .suspended:
                        SuspendedKnowledgeScreen()
                    case .chatQueue:
                        ChatQueueScreen()
                    }
                }
                .confirmationDialog(
                    "Delete \(CountLabel.text(model.selection.count, "item"))? This can't be undone.",
                    isPresented: $confirmingDelete,
                    titleVisibility: .visible
                ) {
                    Button("Delete", role: .destructive) { Task { await model.deleteSelected() } }
                    Button("Cancel", role: .cancel) {}
                }
                .sheet(isPresented: $choosingSubject) {
                    KnowledgeMoveSheet(
                        subjects: model.subjects,
                        loadFailureMessage: model.subjectsNotice,
                        onRetry: { Task { await model.loadSubjects() } }
                    ) { subject in
                        Task { await model.moveSelected(to: subject) }
                    }
                    .macSheetMinSize()
                }
                .task { await model.start() }
                .task { await chatCounts.refresh() }
                .onChange(of: model.subjectId) { model.scheduleReload() }
                .onChange(of: model.statusFilter) { model.scheduleReload() }
                .onChange(of: model.originFilter) { model.scheduleReload() }
                .onChange(of: model.items.map(\.id)) {
                    model.selection.formIntersection(model.items.map(\.id))
                }
                .onChange(of: model.query) { model.scheduleReload(debounce: .milliseconds(300)) }
        }
    }

    private var bulkDisabled: Bool {
        model.selection.isEmpty || model.selectionTooLarge || model.isBulkBusy
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        @Bindable var model = model

        ToolbarItem {
            Picker("Subject", selection: $model.subjectId) {
                Text("All subjects").tag(String?.none)

                ForEach(SubjectTreePath.options(from: model.subjects)) { option in
                    Text(option.label).tag(String?.some(option.id))
                }
            }
            .help("Filter by subject")
        }

        ToolbarItem {
            Menu {
                ForEach(KnowledgeStatusFilter.allCases) { filter in
                    Button {
                        if filter == .suspended { history.open(.suspended) } else { model.statusFilter = filter }
                    } label: {
                        if filter == model.statusFilter {
                            Label(filter.rawValue, systemImage: "checkmark")
                        } else {
                            Text(filter.rawValue)
                        }
                    }
                }

                Divider()

                Picker("Origin", selection: $model.originFilter) {
                    ForEach(KnowledgeOriginFilter.allCases) { origin in
                        Text(origin.label).tag(origin)
                    }
                }
            } label: {
                Label(model.statusFilter.rawValue, systemImage: "line.3.horizontal.decrease.circle")
            }
            .help("Filter by status and origin")
        }

        ToolbarItem {
            Button { choosingSubject = true } label: {
                Label("Move to Subject…", systemImage: "folder")
            }
            .keyboardShortcut("m", modifiers: [.command, .shift])
            .help("Move the selected items to a subject")
            .disabled(bulkDisabled)
        }

        ToolbarItem {
            Button { confirmingDelete = true } label: {
                Label("Delete", systemImage: "trash")
            }
            .help("Delete the selected items")
            .disabled(bulkDisabled)
        }

        ToolbarItem {
            Button { history.open(.chatQueue) } label: {
                HStack(spacing: 4) {
                    Image(systemName: "bubble.left.and.bubble.right")

                    if let badge = chatCounts.badgeText {
                        Text(badge).monospacedDigit()
                    }
                }
            }
            .accessibilityLabel(chatCounts.badgeAccessibilityLabel)
            .help("Chat queue")
            .accessibilityIdentifier("chat-queue-link")
        }

        ToolbarItem {
            Button { MacNavigator.shared.select("ingest") } label: {
                Label("Add knowledge", systemImage: "square.and.pencil")
            }
            .help("Add knowledge")
        }

        ToolbarItem {
            Button { Task { await model.reload() } } label: {
                Label("Reload", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r", modifiers: .command)
            .help("Reload the knowledge list")
            .disabled(model.isLoading)
        }
    }

    @ViewBuilder
    private var content: some View {
        @Bindable var model = model

        if !model.hasLoaded && model.failure == nil {
            ProgressView()
        } else if !model.hasLoaded, model.failure != nil {
            MacLoadStateView(failure: model.failureKind ?? .other) { Task { await model.reload() } }
        } else {
            VSplitView {
                VStack(spacing: 0) {
                    notices
                    MacKnowledgeTable(
                        rows: model.items.map {
                            MacKnowledgeTableRow(item: $0, subjectName: model.subjectName(for: $0.subjectId) ?? "")
                        },
                        selection: $model.selection,
                        onAppearRow: { item in Task { await model.loadMoreIfNeeded(current: item) } },
                        onOpen: { history.open(.item($0)) },
                        contextMenu: { ids in AnyView(rowMenu(ids)) }
                    )
                    footer
                }
                .frame(maxWidth: .infinity, minHeight: 160, maxHeight: .infinity)

                selectedDetail
                    .frame(maxWidth: .infinity, minHeight: 200, maxHeight: .infinity)
            }
            .onDeleteCommand { if !bulkDisabled { confirmingDelete = true } }
            .overlay {
                if model.items.isEmpty && !model.isLoading && !model.hasMore {
                    if model.hasActiveFilter {
                        MacEmptyStateView(
                            title: "No matching items",
                            systemImage: "magnifyingglass",
                            message: "Try a different search, subject, status or origin."
                        )
                    } else {
                        MacEmptyStateView(
                            title: "No approved items yet",
                            systemImage: "tray",
                            message: TriageText.knowledgeEmptyHint
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var selectedDetail: some View {
        if model.selection.count == 1, let item = model.items.first(where: { model.selection.contains($0.id) }) {
            KnowledgeItemDetailScreen(
                item: item,
                subjectName: model.subjectName(for: item.subjectId),
                onStateChange: { state in model.update(item.id, state: state) },
                onDeleted: { model.remove(item.id) },
                onMoved: { _ in Task { await model.reload() } }
            )
            .id(item.id)
        } else {
            MacEmptyStateView(
                title: "No card selected",
                systemImage: "rectangle.and.hand.point.up.left",
                message: "Select one card to see its question, answer and examples."
            )
        }
    }

    @ViewBuilder
    private func rowMenu(_ ids: Set<String>) -> some View {
        if !ids.isEmpty, !model.isBulkBusy {
            Button("Move to Subject…") {
                model.selection = ids
                choosingSubject = true
            }

            Button("Delete", role: .destructive) {
                model.selection = ids
                confirmingDelete = true
            }
        }
    }

    @ViewBuilder
    private var notices: some View {
        if let failure = model.failure {
            Text(failure).zoomFont(.caption).foregroundStyle(.red).zoomPadding(.vertical, 4)
        }

        if let notice = model.notice {
            Text(notice).zoomFont(.caption).foregroundStyle(.secondary).zoomPadding(.vertical, 4)
        }

        if model.selectionTooLarge {
            Text("Select up to \(KnowledgeListModel.selectionLimit) items to move or delete.")
                .zoomFont(.caption)
                .foregroundStyle(.orange)
                .zoomPadding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var footer: some View {
        if model.isLoadingMore || model.isLoading {
            ProgressView().frame(maxWidth: .infinity)
        }
    }
}
