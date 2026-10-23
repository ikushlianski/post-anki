import PostAnkiAPI
import SwiftUI

struct MacContentInboxView: View {
    @State private var model = ContentInboxModel()
    @State private var selection: Set<String> = []
    @State private var opened: ContentInboxItem?

    var body: some View {
        content
            .navigationTitle("Content inbox")
            .toolbar {
                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .sheet(item: $opened) { item in
                MacContentInboxDetail(item: item).macSheetMinSize(width: 480, height: 320)
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
            Table(model.items, selection: $selection) {
                TableColumn("Content") { Text($0.body).lineLimit(2) }
                TableColumn("Suggested") { Text($0.suggestedPlacement ?? "").lineLimit(1) }
                TableColumn("Source") { Text($0.sourceRef ?? "").lineLimit(1) }
                TableColumn("Added") { Text($0.createdAt.prefix(10)) }
            }
            .contextMenu(forSelectionType: String.self) { ids in
                if ids.count == 1, let item = model.items.first(where: { ids.contains($0.id) }) {
                    Button("Show full text") { opened = item }
                    Button("Copy text") { copy(item.body) }
                }
            } primaryAction: { ids in
                if let item = model.items.first(where: { ids.contains($0.id) }) { opened = item }
            }
            .safeAreaInset(edge: .top, spacing: 0) { MacLibraryErrorBanner(message: model.errorMessage) }
            .overlay {
                if model.items.isEmpty {
                    MacEmptyStateView(
                        title: "Nothing in the inbox",
                        systemImage: "tray",
                        message: "Content waiting for a place shows up here."
                    )
                }
            }
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

private struct MacContentInboxDetail: View {
    let item: ContentInboxItem

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView {
                Text(item.body)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let placement = item.suggestedPlacement, !placement.isEmpty {
                Text("Suggested: \(placement)").font(.subheadline)
            }

            if let sourceRef = item.sourceRef, !sourceRef.isEmpty {
                Text(sourceRef).font(.caption).foregroundStyle(.secondary)
            }

            HStack {
                Text(item.createdAt.prefix(10)).font(.caption).foregroundStyle(.secondary)

                Spacer()

                Button("Close") { dismiss() }.keyboardShortcut(.defaultAction)
            }
        }
        .padding()
    }
}
