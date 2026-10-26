import PostAnkiAPI
import SwiftUI

private struct AttentionEditTarget: Identifiable {
    let id: String
    let text: String
}

struct AttentionBlock: View {
    static let discardFailedMessage = "Couldn't discard this note. Try again."

    let notices: [PendingReviewSource]
    let coordinator: AttentionRetryCoordinator
    let onDiscard: (String) async -> Bool

    @State private var editing: AttentionEditTarget?
    @State private var discardingId: String?
    @State private var discardErrors: [String: String] = [:]

    private var retryable: [String] {
        notices.filter { $0.attention?.isInformational == false && !coordinator.isBusy($0.id) }.map(\.id)
    }

    var body: some View {
        Section {
            ForEach(notices) { source in
                if let attention = source.attention {
                    AttentionNoticeRow(
                        source: source,
                        attention: attention,
                        phase: coordinator.phases[source.id],
                        discardError: discardErrors[source.id],
                        onRetry: { Task { await coordinator.retry(source.id) } },
                        onEdit: { editing = AttentionEditTarget(id: source.id, text: attention.sourceText ?? source.sourceText ?? "") },
                        onDiscard: { discardingId = source.id }
                    )
                }
            }

            if let message = coordinator.batchMessage {
                Text(message).font(.footnote).foregroundStyle(.red)
            }
        } header: {
            HStack {
                Text("Needs attention (\(notices.count))")

                Spacer()

                if notices.count > 1 {
                    Button("Retry all (\(retryable.count))") {
                        Task { await coordinator.retryAll(retryable) }
                    }
                    .disabled(retryable.isEmpty)
                }
            }
            .textCase(nil)
        }
        .sheet(item: $editing) { target in
            AttentionEditSheet(
                initialText: target.text,
                onSubmit: { text in
                    editing = nil
                    Task { await coordinator.retry(target.id, text: text) }
                },
                onCancel: { editing = nil }
            )
        }
        .confirmationDialog(
            "Discard this note?",
            isPresented: Binding(get: { discardingId != nil }, set: { if !$0 { discardingId = nil } }),
            titleVisibility: .visible
        ) {
            Button("Discard note", role: .destructive) {
                if let id = discardingId { Task { await discard(id) } }

                discardingId = nil
            }
            Button("Cancel", role: .cancel) { discardingId = nil }
        } message: {
            Text("Its text will be deleted. Cards you already approved stay.")
        }
    }

    private func discard(_ id: String) async {
        discardErrors[id] = nil

        if await !onDiscard(id) { discardErrors[id] = Self.discardFailedMessage }
    }
}
