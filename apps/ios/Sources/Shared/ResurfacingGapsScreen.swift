import PostAnkiAPI
import SwiftUI

struct ResurfacingGapsScreen: View {
    @State private var model = ResurfacingGapsModel()

    var body: some View {
        List {
            if !model.hasLoaded && model.errorMessage != nil {
                ContentUnavailableView {
                    Label("Couldn't load gaps", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(model.errorMessage ?? "")
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else if !model.hasLoaded {
                ProgressView()
            } else {
                if let message = model.errorMessage {
                    Text(message).foregroundStyle(.red)
                }

                group("You said \"later\"", model.userDeferred)
                group("Check-in was dismissed", model.dismissedCheckin)

                if model.isEmpty {
                    Text("No deferred gaps waiting to come back.").foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Gaps coming back")
        .inlineNavigationTitle()
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private func group(_ title: String, _ items: [GapResurfaceItem]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { item in
                    ZoomVStack(alignment: .leading, spacing: 8) {
                        GapRow(gap: item.gap)

                        HStack {
                            Button("Important") { Task { await model.triage(item, action: .important) } }
                            Button("Later again") { Task { await model.triage(item, action: .later) } }
                            Button("Dismiss", role: .destructive) { Task { await model.triage(item, action: .dismiss) } }
                        }
                        .buttonStyle(.bordered)
                        .zoomFont(.caption)
                        .disabled(model.busyIds.contains(item.id))
                    }
                }
            }
        }
    }
}
