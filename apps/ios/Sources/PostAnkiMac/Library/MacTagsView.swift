import PostAnkiAPI
import SwiftUI

struct MacTagsView: View {
    @State private var model = TagsModel()
    @State private var selection: Set<String> = []
    @State private var history = MacHistoryCenter.shared.stack(for: "tags", of: Tag.self)
    @State private var mergeSource: Tag?

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            stackContent
        }
    }

    private var stackContent: some View {
        @Bindable var model = model

        return content
            .navigationTitle("Tags")
            .searchable(text: $model.query, prompt: "Search tags")
            .navigationDestination(for: Tag.self) { TagDetailScreen(tag: $0).id($0.id) }
            .toolbar {
                ToolbarItem {
                    Button { mergeSource = selectedTag } label: {
                        Label("Merge into…", systemImage: "arrow.triangle.merge")
                    }
                    .disabled(selectedTag == nil)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .sheet(item: $mergeSource) { source in
                MergeTagSheet(source: source, candidates: model.tags.filter { $0.id != source.id }) { target in
                    await model.merge(source: source, into: target)
                }
                .macSheetMinSize()
            }
            .task { await model.load() }
    }

    private var selectedTag: Tag? {
        selection.count == 1 ? model.tags.first { selection.contains($0.id) } : nil
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
            Table(model.filtered, selection: $selection) {
                TableColumn("Tag") { Text($0.name) }
                TableColumn("Status") { tag in
                    Text(model.mastery[tag.id]?.statusLabel ?? "New").foregroundStyle(.secondary)
                }
            }
            .contextMenu(forSelectionType: String.self) { ids in
                if ids.count == 1, let tag = model.tags.first(where: { ids.contains($0.id) }) {
                    Button("Open") { history.open(tag) }
                    Button("Merge into…") { mergeSource = tag }
                }
            } primaryAction: { ids in
                if ids.count == 1, let tag = model.tags.first(where: { ids.contains($0.id) }) { history.open(tag) }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 0) {
                    MacLibraryErrorBanner(message: model.errorMessage)

                    if let notice = model.notice {
                        Text(notice)
                            .font(.caption)
                            .foregroundStyle(.green)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(.bar)
                    }
                }
            }
            .overlay {
                if model.filtered.isEmpty {
                    MacEmptyStateView(
                        title: model.query.isEmpty ? "No tags yet" : "No matching tags",
                        systemImage: "tag",
                        message: model.query.isEmpty ? "Tags you add to topics show up here." : "Try a different search."
                    )
                }
            }
        }
    }
}
