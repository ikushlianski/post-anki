import SwiftUI

struct SourceRegenerationRow: View {
    let pendingCount: Int
    let onFinished: () -> Void

    @State private var model: SourceRegenModel
    @State private var confirming = false

    init(sourceId: String, pendingCount: Int = 0, onFinished: @escaping () -> Void) {
        self.pendingCount = pendingCount
        self.onFinished = onFinished
        _model = State(initialValue: SourceRegenModel(sourceId: sourceId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            content
        }
        .confirmationDialog(
            "Regenerate items from this source?",
            isPresented: $confirming,
            titleVisibility: .visible
        ) {
            Button("Regenerate", role: .destructive) {
                Task { await model.start(onFinished: onFinished) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Its \(pendingCount) pending items are replaced with new ones.")
        }
        .onDisappear { model.stop() }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .idle:
            button("Regenerate items")
        case .running(let replaced):
            HStack {
                ProgressView()
                Text(replaced.map { "Regenerating... replaced \($0) items" } ?? "Regenerating...")
            }
        case .done:
            Text("New items are ready.").foregroundStyle(.green)
        case .failed(let reason):
            Text("Regeneration failed: \(reason).").foregroundStyle(.red)
            button("Try again")
        case .timedOut:
            Text("Still working. Pull to refresh later.").foregroundStyle(.secondary)
        case .error(let message):
            Text(message).foregroundStyle(.red)
            button("Try again")
        }
    }

    private func button(_ title: String) -> some View {
        Button { confirming = true } label: {
            Label(title, systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderless)
    }
}
