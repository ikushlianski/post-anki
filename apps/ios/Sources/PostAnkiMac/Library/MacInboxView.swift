import PostAnkiAPI
import SwiftUI

struct MacInboxView: View {
    @State private var model = KnowledgeItemInboxModel()
    @State private var selection: Set<String> = []
    @State private var rejecting: MacDestructiveRequest?

    var body: some View {
        @Bindable var model = model

        content
            .navigationTitle("Inbox")
            .toolbar {
                ToolbarItem {
                    Button { approve(selected) } label: {
                        Label("Approve", systemImage: "checkmark")
                    }
                    .disabled(selected.isEmpty)
                }

                ToolbarItem {
                    Button { confirmReject(selected) } label: {
                        Label("Reject", systemImage: "xmark")
                    }
                    .disabled(selected.isEmpty)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await reload() } }
                }
            }
            .sheet(item: $model.editingItem) { item in
                KnowledgeItemDetailSheet(item: item, model: model).macSheetMinSize(width: 480, height: 460)
            }
            .macConfirmDestructive($rejecting)
            .task { await reload() }
    }

    private var selected: [PendingPlacementSuggestion] {
        model.items.filter { selection.contains($0.id) }
    }

    private func reload() async {
        await model.load()
    }

    private func approve(_ items: [PendingPlacementSuggestion]) {
        selection.subtract(items.map(\.id))
        Task { await model.approveSelected(items) }
    }

    private func confirmReject(_ items: [PendingPlacementSuggestion]) {
        guard !items.isEmpty else { return }

        rejecting = MacDestructiveRequest(verb: "Reject", count: items.count, noun: "item") {
            selection.subtract(items.map(\.id))
            Task { await runConcurrently(items) { await model.reject($0) } }
        }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, let message = model.errorMessage {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) { Task { await reload() } }
        } else if !model.hasLoaded {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List(model.items, selection: $selection) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.body).lineLimit(2)
                    Text(item.placementSuggestion).font(.caption).foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)
                .tag(item.id)
            }
            .contextMenu(forSelectionType: String.self) { ids in
                let items = model.items.filter { ids.contains($0.id) }

                if items.count == 1, let item = items.first {
                    Button("Review…") { model.beginEditing(item) }
                }

                if !items.isEmpty {
                    Button("Approve") { approve(items) }
                    Button("Reject", role: .destructive) { confirmReject(items) }
                }
            } primaryAction: { ids in
                if let item = model.items.first(where: { ids.contains($0.id) }) { model.beginEditing(item) }
            }

            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 0) {
                    MacLibraryErrorBanner(message: model.errorMessage)

                    if let notice = model.notice {
                        Text(notice)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(.bar)
                    }
                }
            }

            .overlay {
                if model.items.isEmpty {
                    MacEmptyStateView(
                        title: "Nothing waiting for review",
                        systemImage: "tray",
                        message: "Suggested placements for new knowledge show up here."
                    )
                }
            }
        }
    }
}
