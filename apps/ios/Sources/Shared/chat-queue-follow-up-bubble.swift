import PostAnkiAPI
import SwiftUI

struct ChatQueueFollowUpBubble: View {
    let followUp: ChatQueueFollowUp
    let onCancel: () -> Void
    let onRetry: () -> Void

    @Environment(\.zoomScale) private var scale

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 48 * CGFloat(scale))

            VStack(alignment: .trailing, spacing: 4 * CGFloat(scale)) {
                Text(verbatim: followUp.text)
                    .zoomFont(.body)
                    .foregroundStyle(Color.white)
                    .zoomPadding(.horizontal, 12)
                    .zoomPadding(.vertical, 8)
                    .background(
                        Color.accentColor.opacity(0.45),
                        in: RoundedRectangle(cornerRadius: 16 * CGFloat(scale), style: .continuous)
                    )

                HStack(spacing: 8 * CGFloat(scale)) {
                    if followUp.state == .failed {
                        Text("Failed").foregroundStyle(.red)

                        Button("Retry", action: onRetry)
                            .buttonStyle(.plain)
                            .foregroundStyle(Color.accentColor)
                            .accessibilityIdentifier("chat-queue-followup-retry-\(followUp.id)")
                    } else {
                        Text("Queued").foregroundStyle(.secondary)
                    }

                    Button(action: onCancel) {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Cancel queued message")
                    .accessibilityIdentifier("chat-queue-followup-cancel-\(followUp.id)")
                }
                .zoomFont(.caption)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("chat-queue-followup-\(followUp.id)")
    }
}
