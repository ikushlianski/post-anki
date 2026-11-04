import PostAnkiAPI
import SwiftUI

struct NotionSourcesScreen: View {
    @State private var model = NotionSourcesModel()
    @State private var form: NotionSourceFormModel?

    var body: some View {
        List {
            if let message = model.actionError {
                Text(message).foregroundStyle(.red)
            }

            if !model.hasLoaded {
                if let message = model.errorMessage {
                    Text(message).foregroundStyle(.red)
                    Button("Try again") { Task { await model.load() } }
                } else {
                    ProgressView()
                }
            } else if model.sources.isEmpty {
                Text("No Notion sources yet. Add a page to import its lines on a schedule.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(model.sources) { source in
                    row(source)
                }
            }
        }
        .navigationTitle("Notion sources")
        .toolbar {
            ToolbarItem {
                Button { form = NotionSourceFormModel() } label: { Label("Add source", systemImage: "plus") }
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .sheet(item: $form) { current in
            NotionSourceForm(
                form: current,
                isSaving: model.isSaving,
                errorMessage: model.saveError,
                onSave: {
                    Task {
                        if await model.save(current) { form = nil }
                    }
                },
                onCancel: { form = nil }
            )
        }
        .confirmationDialog(
            "Delete this source?",
            isPresented: Binding(get: { model.pendingDelete != nil }, set: { if !$0 { model.cancelDelete() } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) { Task { await model.confirmDelete() } }
            Button("Cancel", role: .cancel) { model.cancelDelete() }
        } message: {
            Text(NotionSourceText.deleteMessage)
        }
    }

    private func row(_ source: NotionIngestionSource) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NotionSourceRowContent(
                source: source,
                isRunning: model.runningIds.contains(source.id),
                outcome: model.outcomes[source.id]
            )

            HStack(spacing: 16) {
                Button("Ingest Now") { Task { await model.ingest(source) } }
                    .disabled(model.isIngestDisabled(source))
                Button("Edit") {
                    model.saveError = nil
                    form = NotionSourceFormModel(editing: source)
                }
                Button(source.paused ? "Resume" : "Pause") { Task { await model.togglePause(source) } }
                    .disabled(model.busyIds.contains(source.id))
                Button("Delete", role: .destructive) { model.requestDelete(source) }
                    .disabled(model.busyIds.contains(source.id) || model.runningIds.contains(source.id))
            }
            .buttonStyle(.borderless)
            .zoomFont(.subheadline)
        }
        .padding(.vertical, 4)
    }
}

extension NotionSourceFormModel: Identifiable {
    nonisolated var id: ObjectIdentifier { ObjectIdentifier(self) }
}
