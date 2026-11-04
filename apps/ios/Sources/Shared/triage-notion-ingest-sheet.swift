import PostAnkiAPI
import SwiftUI

enum TriageNotionText {
    static let inboxTitle = "Knowledge Inbox"
    static let entry = "Ingest from Notion"
    static let emptyHint = "Run \(entry) to pull new lines from a Notion page, then triage the cards they create."
    static let knowledgeEmptyHint = "Add knowledge or run \(entry), then approve the suggested items in \(inboxTitle)."
}

struct TriageNotionIngestButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(TriageNotionText.entry, systemImage: "square.and.arrow.down.on.square")
        }
        .labelStyle(.titleAndIcon)
        .accessibilityIdentifier("triage-ingest-from-notion")
    }
}

struct TriageNotionIngestSheet: View {
    let onIngested: () async -> Void
    let onDone: () -> Void

    @State private var model = NotionSourcesModel()
    @State private var form: NotionSourceFormModel?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(TriageNotionText.entry)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done", action: onDone)
                    }

                    ToolbarItem {
                        Button { open(NotionSourceFormModel()) } label: { Label("Add source", systemImage: "plus") }
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
        .macSheetMinSize(width: 520, height: 520)
        .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded {
            if let message = model.errorMessage {
                ContentUnavailableView {
                    Label("Couldn't load", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
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
            List {
                if let message = model.actionError {
                    Text(message).foregroundStyle(.red)
                }

                ForEach(model.sources) { source in
                    row(source)
                }
            }
        }
    }

    private func row(_ source: NotionIngestionSource) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NotionSourceRowContent(
                source: source,
                isRunning: model.runningIds.contains(source.id),
                outcome: model.outcomes[source.id]
            )

            Toggle(
                NotionSourceText.removeToggleTitle,
                isOn: Binding(
                    get: { source.removeAfterImport },
                    set: { value in Task { await model.setRemoveAfterImport(source, value) } }
                )
            )
            .disabled(model.isIngestDisabled(source))

            Text(NotionSourceText.removeFootnote)
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            Button("Ingest Now") {
                Task {
                    await model.ingest(source)
                    await onIngested()
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(model.isIngestDisabled(source))
        }
        .padding(.vertical, 6)
    }

    private func open(_ newForm: NotionSourceFormModel) {
        model.saveError = nil
        form = newForm
    }
}

private struct TriageNotionIngestModifier: ViewModifier {
    @Binding var isPresented: Bool
    let onIngested: () async -> Void

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented) {
            TriageNotionIngestSheet(onIngested: onIngested, onDone: { isPresented = false })
        }
    }
}

extension View {
    func triageNotionIngestSheet(isPresented: Binding<Bool>, onIngested: @escaping () async -> Void) -> some View {
        modifier(TriageNotionIngestModifier(isPresented: isPresented, onIngested: onIngested))
    }
}
