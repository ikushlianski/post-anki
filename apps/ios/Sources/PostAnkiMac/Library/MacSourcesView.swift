import PostAnkiAPI
import SwiftUI

struct MacSourcesView: View {
    @State private var model = SourceLibraryModel()
    @State private var selection: Set<String> = []
    @State private var pendingDelete: [SourceLibraryItem] = []
    @Environment(\.openURL) private var openURL

    private var rows: [SourceLibraryItem] { model.groups.flatMap(\.sources) }

    private var selected: [SourceLibraryItem] { rows.filter { selection.contains($0.id) } }

    private var selectedLinks: [SourceLibraryItem] { selected.filter(\.isLink) }

    var body: some View {
        @Bindable var model = model

        content
            .navigationTitle("Sources")
            .searchable(text: $model.query, prompt: "Search sources")
            .toolbar {
                ToolbarItem {
                    Button { refetch(selectedLinks) } label: {
                        Label("Re-fetch", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(selectedLinks.isEmpty)
                }

                ToolbarItem {
                    Button { pendingDelete = selected } label: { Label("Delete", systemImage: "trash") }
                        .disabled(selected.isEmpty)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .confirmationDialog(
                pendingDelete.count == 1
                    ? "Delete this source from \(pendingDelete[0].curriculumName)?"
                    : "Delete \(pendingDelete.count) sources?",
                isPresented: Binding(get: { !pendingDelete.isEmpty }, set: { if !$0 { pendingDelete = [] } }),
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    let items = pendingDelete

                    pendingDelete = []
                    selection.subtract(items.map(\.id))
                    Task { await runConcurrently(items) { await model.delete($0) } }
                }
                Button("Cancel", role: .cancel) { pendingDelete = [] }
            } message: {
                Text("Lectures and research for those courses will no longer use it.")
            }
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
                .safeAreaInset(edge: .top, spacing: 0) { MacLibraryErrorBanner(message: model.errorMessage) }
                .overlay {
                    if rows.isEmpty {
                        MacEmptyStateView(
                            title: model.query.isEmpty ? "No sources yet" : "No matching sources",
                            systemImage: "books.vertical",
                            message: model.query.isEmpty
                                ? "Sources you add to a course show up here."
                                : "Try a different search."
                        )
                    }
                }
        }
    }

    private var table: some View {
        Table(rows, selection: $selection) {
            TableColumn("Source") { source in
                HStack {
                    Text(source.displayTitle).lineLimit(1)

                    if model.busyIds.contains(source.id) { ProgressView().controlSize(.small) }
                }
            }
            TableColumn("Course") { Text($0.curriculumName).lineLimit(1) }
            TableColumn("Subject") { Text($0.subjectName).lineLimit(1) }
            TableColumn("Type") { Text($0.kindLabel) }
            TableColumn("Status") { source in
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.badge(for: source))

                    if let message = model.rowMessages[source.id] {
                        Text(message).font(.caption).foregroundStyle(.orange)
                    }
                }
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            let items = rows.filter { ids.contains($0.id) }
            let links = items.filter(\.isLink)

            if items.count == 1, let link = links.first, let url = WebLink.url(from: link.value) {
                Button("Open link") { openURL(url) }
            }

            if !links.isEmpty {
                Button("Re-fetch") { refetch(links) }
            }

            if !items.isEmpty {
                Button("Delete", role: .destructive) { pendingDelete = items }
            }
        }
        .onDeleteCommand { if !selected.isEmpty { pendingDelete = selected } }
    }

    private func refetch(_ items: [SourceLibraryItem]) {
        Task { await runConcurrently(items) { await model.refetch($0) } }
    }
}
