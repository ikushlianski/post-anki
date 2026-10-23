import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DocScanModel {
    let subjectId: String
    var suggestions: DocScanSuggestions?
    var isLoading = false
    var isRunning = false
    var errorMessage: String?
    var notice: String?

    init(subjectId: String) {
        self.subjectId = subjectId
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            suggestions = try await APIClient.docScanSuggestions(subjectId: subjectId)
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DomainMapError.message(for: error)
        }
    }

    func scan() async {
        notice = nil
        isRunning = true
        defer { isRunning = false }

        do {
            try await APIClient.runDocScan(subjectId: subjectId)
            notice = "Scan finished."
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }

    func resolveTopic(_ item: DomainTopicSuggestion, accepted: Bool) async {
        await resolve { try await APIClient.resolveDomainTopicSuggestion(id: item.id, accepted: accepted) }
    }

    func resolveSupersession(_ item: DomainSupersessionSuggestion, accepted: Bool) async {
        await resolve { try await APIClient.resolveDomainSupersessionSuggestion(id: item.id, accepted: accepted) }
    }

    private func resolve(_ call: () async throws -> Void) async {
        notice = nil

        do {
            try await call()
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }
}

struct DocScanScreen: View {
    let names: [String: String]

    @State private var model: DocScanModel
    @State private var confirmScan = false

    init(subjectId: String, names: [String: String]) {
        _model = State(initialValue: DocScanModel(subjectId: subjectId))
        self.names = names
    }

    var body: some View {
        List {
            if let notice = model.notice {
                Text(notice).foregroundStyle(.secondary)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            }

            Section {
                Button("Scan documents") { confirmScan = true }
                    .disabled(model.isRunning)

                if model.isRunning { ProgressView() }
            }

            Section("New areas") {
                if let items = model.suggestions?.newTopics, !items.isEmpty {
                    ForEach(items) { item in
                        ZoomVStack(alignment: .leading, spacing: 6) {
                            Text(item.proposedNodeName).zoomFont(.headline)
                            Text(item.reason).zoomFont(.caption).foregroundStyle(.secondary)

                            TriageButtons(
                                accept: { Task { await model.resolveTopic(item, accepted: true) } },
                                reject: { Task { await model.resolveTopic(item, accepted: false) } }
                            )
                        }
                    }
                } else {
                    Text("Nothing pending.").foregroundStyle(.secondary)
                }
            }

            Section("Replacements") {
                if let items = model.suggestions?.supersessions, !items.isEmpty {
                    ForEach(items) { item in
                        ZoomVStack(alignment: .leading, spacing: 6) {
                            Text(names[item.domainNodeId] ?? "(removed)").zoomFont(.headline)
                            Text(item.reason).zoomFont(.caption).foregroundStyle(.secondary)

                            TriageButtons(
                                accept: { Task { await model.resolveSupersession(item, accepted: true) } },
                                reject: { Task { await model.resolveSupersession(item, accepted: false) } }
                            )
                        }
                    }
                } else {
                    Text("Nothing pending.").foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Document scan")
        .confirmationDialog("This uses an AI call.", isPresented: $confirmScan, titleVisibility: .visible) {
            Button("Scan documents") { Task { await model.scan() } }
        }
        #if os(macOS)
        .toolbar {
            ToolbarItem {
                Button { Task { await model.load() } } label: { Label("Reload", systemImage: "arrow.clockwise") }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
            }
        }
        #endif
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}
