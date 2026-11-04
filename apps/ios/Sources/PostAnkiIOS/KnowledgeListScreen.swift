import PostAnkiAPI
import SwiftUI

struct KnowledgeListScreen: View {
    @State private var model = KnowledgeListModel()
    @State private var editMode: EditMode = .inactive
    @State private var confirmingDelete = false
    @State private var choosingSubject = false
    @State private var showSuspended = false
    @State private var meaning = KnowledgeMeaningSearchModel()
    var isPushed = false

    var body: some View {
        @Bindable var model = model

        content
            .navigationTitle("All items")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $model.query, prompt: meaning.isOn ? "Describe what you remember" : "Search items")
            .onSubmit(of: .search) {
                Task { await runMeaningSearch() }
            }
            .environment(\.editMode, $editMode)
            .toolbar { toolbar }
            .safeAreaInset(edge: .bottom, spacing: 0) { selectionBar }
            .navigationDestination(for: KnowledgeOverviewItem.self) { item in
                KnowledgeItemDetailScreen(
                    item: item,
                    subjectName: model.subjectName(for: item.subjectId),
                    onStateChange: { state in model.update(item.id, state: state) },
                    onDeleted: { model.remove(item.id) },
                    onMoved: { _ in Task { await model.reload() } }
                )
            }
            .navigationDestination(isPresented: $showSuspended) { SuspendedKnowledgeScreen() }
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
            }
            .task { await model.start() }
            .onChange(of: model.subjectId) { model.scheduleReload() }
            .onChange(of: model.statusFilter) { filtersChanged() }
            .onChange(of: model.originFilter) { filtersChanged() }
            .onChange(of: model.query) {
                if meaning.isOn { meaning.clear() } else { model.scheduleReload(debounce: .milliseconds(300)) }
            }
            .onChange(of: meaning.isOn) {
                meaning.clear()
                editMode = .inactive
                model.scheduleReload()
            }
    }

    private func runMeaningSearch() async {
        await meaning.search(
            text: model.query,
            subjectId: model.subjectId,
            states: model.statusFilter.states,
            origins: model.originFilter.origins
        )
    }

    private func filtersChanged() {
        model.scheduleReload()

        if meaning.isOn { Task { await runMeaningSearch() } }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        @Bindable var model = model

        ToolbarItem(placement: isPushed ? .topBarTrailing : .topBarLeading) {
            Menu {
                Picker("Subject", selection: $model.subjectId) {
                    Text("All subjects").tag(String?.none)

                    ForEach(SubjectTreePath.options(from: model.subjects)) { option in
                        Text(option.label).tag(String?.some(option.id))
                    }
                }
            } label: {
                Label(model.subjectName(for: model.subjectId) ?? "All subjects", systemImage: "folder")
            }
        }

        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Toggle("Search by meaning", isOn: $meaning.isOn)

                Divider()

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

                Divider()

                Picker("Origin", selection: $model.originFilter) {
                    ForEach(KnowledgeOriginFilter.allCases) { origin in
                        Text(origin.label).tag(origin)
                    }
                }
            } label: {
                Label(filterTitle, systemImage: "line.3.horizontal.decrease.circle")
            }
        }

        if !meaning.isOn {
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
        }
    }

    private var filterTitle: String {
        model.originFilter == .all ? model.statusFilter.rawValue : "\(model.statusFilter.rawValue) · \(model.originFilter.label)"
    }

    @ViewBuilder
    private var selectionBar: some View {
        if editMode.isEditing {
            let blocked = model.selection.isEmpty || model.selectionTooLarge || model.isBulkBusy

            VStack(spacing: 0) {
                if model.selectionTooLarge {
                    Text("Select up to \(KnowledgeListModel.selectionLimit)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 4)
                        .frame(maxWidth: .infinity)
                        .background(.bar)
                }

                MainActionControls(tiles: [
                    MainActionTile(title: "Move (\(model.selection.count))", style: .prominent, isDisabled: blocked) {
                        choosingSubject = true
                    },
                    MainActionTile(title: "Delete (\(model.selection.count))", style: .destructive, isDisabled: blocked) {
                        confirmingDelete = true
                    }
                ])
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        @Bindable var model = model

        if meaning.isOn {
            KnowledgeMeaningResults(
                search: meaning,
                queryIsEmpty: model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )
        } else if !model.hasLoaded && model.failure == nil {
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

                ForEach(model.items) { item in
                    NavigationLink(value: item) {
                        KnowledgeListRow(item: item, subjectName: model.subjectName(for: item.subjectId))
                    }
                    .task { await model.loadMoreIfNeeded(current: item) }
                }

                footer
            }
            .overlay {
                if model.items.isEmpty && !model.isLoading && !model.hasMore {
                    ContentUnavailableView {
                        Label(model.hasActiveFilter ? "No matching items" : "No approved items yet", systemImage: "tray")
                    } actions: {
                        if model.hasActiveFilter {
                            Button("Clear filters") { Task { await model.clearFilters() } }
                                .accessibilityIdentifier("knowledge-clear-filters")
                        }
                    }
                }
            }
            .refreshable { await model.reload() }
        }
    }

    @ViewBuilder
    private var footer: some View {
        if model.isLoadingMore || model.isLoading {
            ProgressView().frame(maxWidth: .infinity)
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
            Text(CardKind.hideBlanks(item.question)).lineLimit(2)
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
