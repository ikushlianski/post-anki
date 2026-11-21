import PostAnkiAPI
import SwiftUI

struct ChatQueueProposalRejectPanel: View {
    let index: Int
    let isDisabled: Bool
    let onSend: (String) -> Void
    let onDiscard: () -> Void
    let onBack: () -> Void

    @State private var reason: RejectReason?
    @State private var note = ""

    private var feedback: String { ChatQueueProposalRejectFeedback.text(reason: reason, note: note) }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            Text("What is wrong with it?")
                .zoomFont(.subheadline.weight(.medium))

            ForEach(RejectReason.selectable) { code in
                Button {
                    reason = reason == code ? nil : code
                } label: {
                    Label(code.label, systemImage: reason == code ? "checkmark.circle.fill" : "circle")
                }
                .buttonStyle(.plain)
                .zoomFont(.caption)
                .accessibilityAddTraits(reason == code ? .isSelected : [])
                .accessibilityIdentifier("chat-queue-proposal-reason-\(index)-\(code.rawValue)")
            }

            TextField("Tell the tutor what to fix", text: $note)
                .textFieldStyle(.roundedBorder)
                .onChange(of: note) { _, value in
                    if value.count > ChatQueueProposalRejectFeedback.noteMaxCharacters {
                        note = String(value.prefix(ChatQueueProposalRejectFeedback.noteMaxCharacters))
                    }
                }
                .accessibilityIdentifier("chat-queue-proposal-reject-note-\(index)")

            HStack {
                Button("Send") { onSend(feedback) }
                    .buttonStyle(.borderedProminent)
                    .disabled(feedback.isEmpty)
                    .accessibilityIdentifier("chat-queue-proposal-reject-send-\(index)")

                Button("Discard card", action: onDiscard)
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("chat-queue-proposal-discard-\(index)")

                Button("Back", action: onBack)
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("chat-queue-proposal-reject-back-\(index)")
            }
            .controlSize(.small)
        }
        .disabled(isDisabled)
    }
}
