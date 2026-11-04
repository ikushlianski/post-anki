import PostAnkiAPI
import SwiftUI

struct MacNotionSourcesView: View {
    @State private var model = NotionSourcesModel()
    @State private var form: NotionSourceFormModel?
    @State private var confirmation: MacDestructiveRequest?

    var embedded = false

    var body: some View {
        Group {
            if embedded {
                embeddedContent
            } else {
                content
                    .navigationTitle("Notion sources")
                    .toolbar {
                        ToolbarItem {
                            Button { open(NotionSourceFormModel()) } label: { Label("Add source", systemImage: "plus") }
                        }

                        ToolbarItem {
                            MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                        }
                    }
            }
        }
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
            .macConfirmDestructive($confirmation)
            .task { await model.load() }
    }

    private var embeddedContent: some View {
        Form {
            NotionConnectionSection()

            Section {
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
                    Text(NotionSourceText.emptyMessage).foregroundStyle(.secondary)
                } else {
                    ForEach(model.sources) { source in
                        row(source)
                    }
                }
            } header: {
                HStack {
                    Text("Notion sources")
                    Spacer()
                    Button { open(NotionSourceFormModel()) } label: { Label("Add source", systemImage: "plus") }
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
        }
        .formStyle(.grouped)
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded {
            if let message = model.errorMessage {
                MacLoadStateView(failure: model.failureKind ?? .other, detail: message) { Task { await model.load() } }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else if model.sources.isEmpty {
            ContentUnavailableView {
                Label(NotionSourceText.emptyTitle, systemImage: "square.and.arrow.down.on.square")
            } description: {
                Text(NotionSourceText.emptyMessage)
            } actions: {
                Button("Add source") { open(NotionSourceFormModel()) }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
        } else {
            List(model.sources) { source in
                row(source)
            }
            .safeAreaInset(edge: .top, spacing: 0) { MacLibraryErrorBanner(message: model.actionError) }
        }
    }

    private func row(_ source: NotionIngestionSource) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NotionSourceRowContent(
                source: source,
                isRunning: model.runningIds.contains(source.id),
                outcome: model.outcomes[source.id]
            )

            HStack {
                Button("Ingest Now") { Task { await model.ingest(source) } }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isIngestDisabled(source))
                Button("Edit") { open(NotionSourceFormModel(editing: source)) }
                Button(source.paused ? "Resume" : "Pause") { Task { await model.togglePause(source) } }
                    .disabled(model.busyIds.contains(source.id))
                Button("Delete", role: .destructive) { askDelete(source) }
                    .disabled(model.busyIds.contains(source.id) || model.runningIds.contains(source.id))
            }
        }
        .padding(.vertical, 6)
    }

    private func open(_ newForm: NotionSourceFormModel) {
        model.saveError = nil
        form = newForm
    }

    private func askDelete(_ source: NotionIngestionSource) {
        model.requestDelete(source)
        confirmation = MacDestructiveRequest(
            verb: "Delete",
            count: 1,
            noun: "source",
            message: NotionSourceText.deleteMessage,
            action: { Task { await model.confirmDelete() } }
        )
    }
}
