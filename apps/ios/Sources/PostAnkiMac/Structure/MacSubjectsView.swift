import PostAnkiAPI
import SwiftUI

struct MacSubjectRow: Identifiable, Hashable {
    let subject: SubjectManageSubject
    let depth: Int

    var id: String { subject.id }
}

struct MacSubjectsView: View {
    @State private var model = SubjectManageModel()
    @State private var selection: Set<String> = []
    @State private var showNew = false
    @State private var renaming: SubjectManageSubject?
    @State private var merging: SubjectManageSubject?
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
                }

                ToolbarItem {
                    Button { renaming = single } label: { Label("Rename", systemImage: "pencil") }
                        .disabled(single == nil)
                }

                ToolbarItem {
                    Button { merging = single } label: { Label("Merge into…", systemImage: "arrow.triangle.merge") }
                        .disabled(single == nil)
                }

                ToolbarItem {
                    Button { pendingDelete = selected } label: { Label("Delete", systemImage: "trash") }
                        .disabled(selected.isEmpty)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .sheet(isPresented: $showNew) {
                SubjectNewSheet(subjects: model.subjects) { name, parentId in
                    SheetFailure.message(await model.create(name: name, parentId: parentId), model.errorMessage)
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
        Table(rows, selection: $selection) {
            TableColumn("Subject") { row in
                Text(row.subject.name)
                    .lineLimit(1)
                    .zoomPadding(.leading, CGFloat(row.depth) * 16)
            }
            TableColumn("Inside") { Text(model.name(of: $0.subject.parentId)).foregroundStyle(.secondary) }
            TableColumn("Kind") { Text($0.subject.kind.capitalized) }
            TableColumn("Courses") { Text("\(model.courseCount(of: $0.subject.id))") }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            let items = rows.map(\.subject).filter { ids.contains($0.id) }

            if items.count == 1, let subject = items.first {
                Button("Open categories") { history.open(subject) }
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

        return "Delete \(pendingDelete.count) subjects?"
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
            .flatMap { subject in
                [MacSubjectRow(subject: subject, depth: depth)]
                    + flatten(parentId: subject.id, depth: depth + 1, visited: visited.union([subject.id]))
            }
    }
}
