import PostAnkiAPI
import SwiftUI

enum MacKnowledgeRoute: Hashable {
    case item(KnowledgeOverviewItem)
    case suspended
}

struct MacKnowledgeView: View {
    @State private var model = KnowledgeListModel()
    @State private var history = MacHistoryCenter.shared.stack(for: "knowledge", of: MacKnowledgeRoute.self)
    @State private var confirmingDelete = false
    @State private var choosingSubject = false

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
                        KnowledgeItemDetailScreen(item: item, subjectName: model.subjectName(for: item.subjectId)) { state in
                            model.update(item.id, state: state)
                        }
                        .id(item.id)
                    case .suspended:
                        SuspendedKnowledgeScreen()
                    }
                }
                .confirmationDialog(
                    "Delete \(model.selection.count) items? This can't be undone.",
                    isPresented: $confirmingDelete,
                    titleVisibility: .visible
                ) {
                    Button("Delete", role: .destructive) { Task { await model.deleteSelected() } }
                    Button("Cancel", role: .cancel) {}
                }
                .sheet(isPresented: $choosingSubject) {
                    KnowledgeMoveSheet(subjects: model.subjects) { subject in
                        Task { await model.moveSelected(to: subject) }
                    }
                    .macSheetMinSize()
                }
                .task { await model.start() }
                .onChange(of: model.subjectId) { model.scheduleReload() }
                .onChange(of: model.visibleItems.map(\.id)) {
                    model.selection.formIntersection(model.visibleItems.map(\.id))
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

                ForEach(model.subjects) { subject in
                    Text(subject.name).tag(String?.some(subject.id))
                }
            }
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
            } label: {
                Label(model.statusFilter.rawValue, systemImage: "line.3.horizontal.decrease.circle")
            }
        }

        ToolbarItem {
            Button { choosingSubject = true } label: {
                Label("Move to Subject…", systemImage: "folder")
            }
            .keyboardShortcut("m", modifiers: [.command, .shift])
            .disabled(bulkDisabled)
        }

        ToolbarItem {
            Button { confirmingDelete = true } label: {
                Label("Delete", systemImage: "trash")
            }
            .disabled(bulkDisabled)
        }

        ToolbarItem {
            Button { MacNavigator.shared.select("ingest") } label: {
                Label("Add knowledge", systemImage: "square.and.pencil")
            }
        }

        ToolbarItem {
            Button { Task { await model.reload() } } label: {
                Label("Reload", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r", modifiers: .command)
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
            VStack(spacing: 0) {
                notices
                MacKnowledgeTable(
                    rows: model.visibleItems.map {
                        MacKnowledgeTableRow(item: $0, subjectName: model.subjectName(for: $0.subjectId) ?? "")
                    },
                    selection: $model.selection,
                    onAppearRow: { item in Task { await model.loadMoreIfNeeded(current: item) } },
                    onOpen: { history.open(.item($0)) },
                    contextMenu: { ids in AnyView(rowMenu(ids)) }
                )
                footer
            }
            .onDeleteCommand { if !bulkDisabled { confirmingDelete = true } }
            .overlay {
                if model.visibleItems.isEmpty && !model.isLoading && !model.hasMore {
                    if model.hasActiveFilter {
                        MacEmptyStateView(
                            title: "No matching items",
                            systemImage: "magnifyingglass",
                            message: "Try a different search, subject or status."
                        )
                    } else {
                        MacEmptyStateView(
                            title: "No approved items yet",
                            systemImage: "tray",
                            message: "Add knowledge from Ingest, then approve the suggested items in Knowledge Inbox."
                        )
                    }
                }
            }
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
            Text(failure).font(.caption).foregroundStyle(.red).padding(.vertical, 4)
        }

        if let notice = model.notice {
            Text(notice).font(.caption).foregroundStyle(.secondary).padding(.vertical, 4)
        }

        if model.selectionTooLarge {
            Text("Select up to \(KnowledgeListModel.selectionLimit) items to move or delete.")
                .font(.caption)
                .foregroundStyle(.orange)
                .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var footer: some View {
        if model.isLoadingMore || model.isLoading {
            ProgressView().frame(maxWidth: .infinity)
        } else if model.hasMore && model.statusFilter != .all {
            Text("Filtering loaded items")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
