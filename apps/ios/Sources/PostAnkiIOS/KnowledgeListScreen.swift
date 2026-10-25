import PostAnkiAPI
import SwiftUI

struct KnowledgeListScreen: View {
    @State private var model = KnowledgeListModel()
    @State private var editMode: EditMode = .inactive
    @State private var confirmingDelete = false
    @State private var choosingSubject = false
    @State private var showSuspended = false

    var body: some View {
        @Bindable var model = model

        content
            .navigationTitle("All items")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $model.query, prompt: "Search items")
            .environment(\.editMode, $editMode)
            .toolbar { toolbar }
            .safeAreaInset(edge: .bottom, spacing: 0) { selectionBar }
            .navigationDestination(for: KnowledgeOverviewItem.self) { item in
                KnowledgeItemDetailScreen(item: item, subjectName: model.subjectName(for: item.subjectId)) { state in
                    model.update(item.id, state: state)
                }
            }
            .navigationDestination(isPresented: $showSuspended) { SuspendedKnowledgeScreen() }
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
            }
            .task { await model.start() }
            .onChange(of: model.subjectId) { model.scheduleReload() }
            .onChange(of: model.query) { model.scheduleReload(debounce: .milliseconds(300)) }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        @Bindable var model = model

        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Picker("Subject", selection: $model.subjectId) {
                    Text("All subjects").tag(String?.none)

                    ForEach(model.subjects) { subject in
                        Text(subject.name).tag(String?.some(subject.id))
                    }
                }
            } label: {
                Label(model.subjectName(for: model.subjectId) ?? "All subjects", systemImage: "folder")
            }
        }

        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                ForEach(KnowledgeStatusFilter.allCases) { filter in
                    Button {
                        if filter == .suspended { showSuspended = true } else { model.statusFilter = filter }
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

        ToolbarItem(placement: .topBarTrailing) { EditButton() }
    }

    @ViewBuilder
    private var selectionBar: some View {
        if editMode.isEditing {
            VStack(spacing: 4) {
                if model.selectionTooLarge {
                    Text("Select up to \(KnowledgeListModel.selectionLimit)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 12) {
                    BottomActionBarButton(
                        title: "Move (\(model.selection.count))",
                        isDisabled: model.selection.isEmpty || model.selectionTooLarge || model.isBulkBusy
                    ) { choosingSubject = true }

                    BottomActionBarButton(
                        title: "Delete (\(model.selection.count))",
                        role: .destructive,
                        isDisabled: model.selection.isEmpty || model.selectionTooLarge || model.isBulkBusy
                    ) { confirmingDelete = true }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(.bar)
        }
    }

    @ViewBuilder
    private var content: some View {
        @Bindable var model = model

        if !model.hasLoaded && model.failure == nil {
            ProgressView()
        } else if !model.hasLoaded, let message = model.failure {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await model.reload() } }
            }
        } else {
            List(selection: $model.selection) {
                if let failure = model.failure {
                    Text(failure).font(.caption).foregroundStyle(.red)
                }

                if let notice = model.notice {
                    Text(notice).font(.caption).foregroundStyle(.secondary)
                }

                ForEach(model.visibleItems) { item in
                    NavigationLink(value: item) {
                        KnowledgeListRow(item: item, subjectName: model.subjectName(for: item.subjectId))
                    }
                    .task { await model.loadMoreIfNeeded(current: item) }
                }

                footer
            }
            .overlay {
                if model.visibleItems.isEmpty && !model.isLoading && !model.hasMore {
                    ContentUnavailableView(
                        model.hasActiveFilter ? "No matching items" : "No approved items yet",
                        systemImage: "tray"
                    )
                }
            }
            .refreshable { await model.reload() }
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

private struct KnowledgeListRow: View {
    let item: KnowledgeOverviewItem
    let subjectName: String?

    private var dueText: String? {
        item.dueAt.flatMap { DueReviewModel.nextDueText($0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.question).lineLimit(2)
            Text(item.answer).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)

            HStack(spacing: 6) {
                Text(item.stateLabel)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())

                if let subjectName { Text(subjectName) }

                if let dueText { Text("Due \(dueText)") }

                if item.lapses > 0 { Text("\(item.lapses) lapses") }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
