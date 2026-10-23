import PostAnkiAPI
import SwiftUI

struct MacResurfacingGapsView: View {
    @State private var model = ResurfacingGapsModel()

    var body: some View {
        content
            .navigationTitle("Gaps coming back")
            .toolbar {
                ToolbarItem {
                    Button { Task { await model.load() } } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
                }
            }
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, let message = model.errorMessage {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) { Task { await model.load() } }
        } else if !model.hasLoaded {
            ProgressView()
        } else if model.isEmpty {
            MacEmptyStateView(
                title: "Nothing coming back",
                systemImage: "arrow.uturn.backward.circle",
                message: "No deferred gaps are waiting to come back."
            )
        } else {
            List {
                if let message = model.errorMessage {
                    Text(message).font(.caption).foregroundStyle(.red)
                }

                group("You said \"later\"", model.userDeferred)
                group("Check-in was dismissed", model.dismissedCheckin)
            }
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ items: [GapResurfaceItem]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        GapRow(gap: item.gap)

                        HStack {
                            ForEach(actions, id: \.action) { entry in
                                Button(entry.title) { Task { await model.triage(item, action: entry.action) } }
                            }
                        }
                        .buttonStyle(.bordered)
                        .font(.caption)
                    }
                    .disabled(model.busyIds.contains(item.id))
                    .contextMenu {
                        ForEach(actions, id: \.action) { entry in
                            Button(entry.title) { Task { await model.triage(item, action: entry.action) } }
                        }
                    }
                }
            }
        }
    }

    private var actions: [(title: String, action: GapTriageAction)] {
        [("Important", .important), ("Later again", .later), ("Dismiss", .dismiss)]
    }
}
