import PostAnkiAPI
import SwiftUI

struct MacSubjectRow: Identifiable, Hashable {
    let subject: SubjectManageSubject
    let depth: Int

    var id: String { subject.id }
    var cardSortKey: Int { subject.cardCount ?? 0 }
}

struct MacSubjectsView: View {
    @State private var model = SubjectManageModel()
    @State private var selection: Set<String> = []
    @State private var sortOrder: [KeyPathComparator<MacSubjectRow>] = []
    @State private var showNew = false
    @State private var renaming: SubjectManageSubject?
    @State private var merging: SubjectManageSubject?
    @State private var planning: SubjectManageSubject?
    @State private var pendingDelete: [SubjectManageSubject] = []
    @State private var history = MacHistoryCenter.shared.stack(for: "subjects", of: SubjectManageSubject.self)

    private var rows: [MacSubjectRow] { flatten(parentId: nil, depth: 0, visited: []) }

    private var selected: [SubjectManageSubject] {
        rows.map(\.subject).filter { selection.contains($0.id) }
    }

    private var single: SubjectManageSubject? { selected.count == 1 ? selected.first : nil }

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            stackContent
        }
    }

    private var stackContent: some View {
        content
            .navigationTitle("Subjects")
            .navigationDestination(for: SubjectManageSubject.self) { SubjectCategoryScreen(subject: $0).id($0.id) }
            .toolbar {
                ToolbarItem {
                    Button { showNew = true } label: { Label("New subject", systemImage: "plus") }
                        .help("New subject")
                }

                ToolbarItem {
                    Button { renaming = single } label: { Label("Rename", systemImage: "pencil") }
                        .help("Rename the selected subject")
                        .disabled(single == nil)
                }

                ToolbarItem {
                    Button { merging = single } label: { Label("Merge into…", systemImage: "arrow.triangle.merge") }
                        .help("Merge the selected subject into another")
                        .disabled(single == nil)
                }

                ToolbarItem {
                    Button { planning = single } label: { Label("Study plan", systemImage: "calendar.badge.clock") }
                        .help("Open the study plan of the selected subject")
                        .disabled(single == nil)
                }

                ToolbarItem {
                    Button { pendingDelete = selected } label: { Label("Delete", systemImage: "trash") }
                        .help("Delete the selected subjects")
                        .disabled(selected.isEmpty)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                        .help("Reload subjects")
                }
            }
            .sheet(isPresented: $showNew) {
                SubjectNewSheet(subjects: model.subjects) { name, parentId, level in
                    SheetFailure.message(
                        await model.create(name: name, parentId: parentId, complexityLevel: level),
                        model.errorMessage
                    )
                }
                .macSheetMinSize()
            }
            .sheet(item: $renaming) { subject in
                SubjectRenameSheet(title: "Rename subject", currentName: subject.name) { name in
                    SheetFailure.message(await model.rename(subject, to: name), model.errorMessage)
                }
                .macSheetMinSize()
            }
            .sheet(item: $merging) { source in
                SubjectMergeSheet(source: source, candidates: model.mergeCandidates(for: source)) { target in
                    SheetFailure.message(await model.merge(source: source, into: target), model.errorMessage)
                }
                .macSheetMinSize()
            }
            .sheet(item: $planning) { subject in
                MacSubjectStudyPlanSheet(subject: subject)
            }
            .confirmationDialog(
                deleteTitle,
                isPresented: Binding(get: { !pendingDelete.isEmpty }, set: { if !$0 { pendingDelete = [] } }),
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) { confirmDelete() }
                Button("Cancel", role: .cancel) { pendingDelete = [] }
            } message: {
                Text("Their courses are deleted too. Subjects inside them move up a level.")
            }
            .disabled(model.isWorking)
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded {
            if let message = model.errorMessage {
                MacLoadStateView(failure: model.failureKind ?? .other, detail: message) { Task { await model.load() } }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            table
                .safeAreaInset(edge: .top, spacing: 0) {
                    VStack(spacing: 0) {
                        MacLibraryErrorBanner(message: model.errorMessage)

                        if let notice = model.notice {
                            Text(notice)
                                .zoomFont(.caption)
                                .foregroundStyle(.green)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .zoomPadding(.horizontal, 12)
                                .zoomPadding(.vertical, 6)
                                .background(.bar)
                        }
                    }
                }
                .overlay {
                    if rows.isEmpty {
                        MacEmptyStateView(
                            title: "No subjects yet",
                            systemImage: "folder.badge.gearshape",
                            message: "Use New subject to add one."
                        )
                    }
                }
        }
    }

    private var table: some View {
        Table(rows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Subject") { row in
                HStack(spacing: 6) {
                    Text(row.subject.name).lineLimit(1)

                    if let badge = SubjectKindLabel.badge(for: row.subject.kind) {
                        Text(badge)
                            .zoomFont(.caption2)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(.quaternary, in: Capsule())
                            .help("Kind: \(badge)")
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(SubjectKindLabel.badge(for: row.subject.kind).map { "\(row.subject.name), \($0)" } ?? row.subject.name)
                .zoomPadding(.leading, CGFloat(row.depth) * 16)
            }
            TableColumn("Inside") { Text(model.name(of: $0.subject.parentId)).foregroundStyle(.secondary) }
            TableColumn("Cards", value: \.cardSortKey) { row in
                Text(row.subject.cardCount.map(String.init) ?? "–")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .width(min: 50, ideal: 60, max: 90)
        }
        .contextMenu(forSelectionType: String.self) { ids in
            let items = rows.map(\.subject).filter { ids.contains($0.id) }

            if items.count == 1, let subject = items.first {
                Button("Open categories") { history.open(subject) }
                Button("Study plan") { planning = subject }
                Button("Rename") { renaming = subject }
                Button("Merge into…") { merging = subject }
                Button("Move up") { move(subject, by: -1) }
                Button("Move down") { move(subject, by: 1) }
            }

            if !items.isEmpty {
                Button("Delete", role: .destructive) { pendingDelete = items }
            }
        } primaryAction: { ids in
            if ids.count == 1, let subject = rows.map(\.subject).first(where: { ids.contains($0.id) }) {
                history.open(subject)
            }
        }
        .onDeleteCommand { if !selected.isEmpty { pendingDelete = selected } }
    }

    private var deleteTitle: String {
        if pendingDelete.count == 1, let subject = pendingDelete.first {
            let count = model.courseCount(of: subject.id)

            return "Delete \(subject.name) and its \(count) \(count == 1 ? "course" : "courses")?"
        }

        return "Delete \(CountLabel.text(pendingDelete.count, "subject"))?"
    }

    private func confirmDelete() {
        let items = pendingDelete

        pendingDelete = []
        selection.subtract(items.map(\.id))

        Task {
            for subject in items {
                await model.delete(subject)
            }
        }
    }

    private func move(_ subject: SubjectManageSubject, by step: Int) {
        let siblings = model.children(of: subject.parentId)

        guard let index = siblings.firstIndex(of: subject) else { return }

        let target = index + step

        guard siblings.indices.contains(target) else { return }

        let destination = step > 0 ? target + 1 : target

        Task { await model.move(parentId: subject.parentId, from: IndexSet(integer: index), to: destination) }
    }

    private func flatten(parentId: String?, depth: Int, visited: Set<String>) -> [MacSubjectRow] {
        model.children(of: parentId)
            .filter { !visited.contains($0.id) }
            .map { MacSubjectRow(subject: $0, depth: depth) }
            .sorted(using: sortOrder)
            .flatMap { row in
                [row] + flatten(parentId: row.subject.id, depth: depth + 1, visited: visited.union([row.subject.id]))
            }
    }
}
