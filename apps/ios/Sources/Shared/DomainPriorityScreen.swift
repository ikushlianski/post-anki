import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DomainPriorityModel {
    let subjectId: String
    var suggestions: [DomainPrioritySuggestion] = []
    var status: DomainPriorityReviewStatus?
    var isLoading = false
    var hasLoaded = false
    var isRunning = false
    var errorMessage: String?
    var notice: String?

    init(subjectId: String) {
        self.subjectId = subjectId
    }

    var statusText: String {
        guard let status else { return "" }

        if status.due { return "Review due" }

        return status.lastReviewedAt.map { "Last reviewed \($0.prefix(10))" } ?? "Not reviewed yet"
    }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let fetched = APIClient.domainPrioritySuggestions(subjectId: subjectId)
            async let fetchedStatus = APIClient.domainPriorityReviewStatus(subjectId: subjectId)

            suggestions = try await fetched
            status = try await fetchedStatus
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = DomainMapError.message(for: error)
        }
    }

    func resolve(_ suggestion: DomainPrioritySuggestion, accepted: Bool) async {
        notice = nil

        do {
            try await APIClient.resolveDomainPrioritySuggestion(id: suggestion.id, accepted: accepted)
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }

    func run() async {
        notice = nil
        isRunning = true
        defer { isRunning = false }

        do {
            try await APIClient.runDomainPriorityReview(subjectId: subjectId)
            notice = "Review finished."
        } catch {
            notice = DomainMapError.message(for: error)
        }

        await load()
    }
}

struct DomainPriorityScreen: View {
    let names: [String: String]

    @State private var model: DomainPriorityModel
    @State private var confirmRun = false

    init(subjectId: String, names: [String: String]) {
        _model = State(initialValue: DomainPriorityModel(subjectId: subjectId))
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
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            }

            Section {
                if !model.statusText.isEmpty {
                    Text(model.statusText).foregroundStyle(.secondary)
                }

                Button("Run a priority review") { confirmRun = true }
                    .disabled(model.isRunning)

                if model.isRunning { ProgressView() }
            }

            Section("Suggestions") {
                if model.hasLoaded && model.suggestions.isEmpty {
                    Text("No pending suggestions.").foregroundStyle(.secondary)
                }

                ForEach(model.suggestions) { suggestion in
                    ZoomVStack(alignment: .leading, spacing: 6) {
                        Text(names[suggestion.domainNodeId] ?? "(removed)").zoomFont(.headline)

                        Text("\(DomainDepth.label(suggestion.currentTargetDepth)) to \(DomainDepth.label(suggestion.suggestedTargetDepth))")
                            .zoomFont(.subheadline)

                        Text(suggestion.reason).zoomFont(.caption).foregroundStyle(.secondary)

                        TriageButtons(
                            accept: { Task { await model.resolve(suggestion, accepted: true) } },
                            reject: { Task { await model.resolve(suggestion, accepted: false) } }
                        )
                    }
                }
            }
        }
        .navigationTitle("Priority suggestions")
        .confirmationDialog("This uses an AI call.", isPresented: $confirmRun, titleVisibility: .visible) {
            Button("Run review") { Task { await model.run() } }
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

struct TriageButtons: View {
    let accept: () -> Void
    let reject: () -> Void

    var body: some View {
        HStack {
            Button("Accept", action: accept)
                .buttonStyle(.borderedProminent)

            Button("Reject", role: .cancel, action: reject)
                .buttonStyle(.bordered)
        }
    }
}
