import PostAnkiAPI
import SwiftUI

struct ChatQueueMessageBubble: View {
    let line: ChatQueueLine

    @Environment(\.zoomScale) private var scale

    var body: some View {
        HStack(spacing: 0) {
            if line.isUser { Spacer(minLength: 48 * CGFloat(scale)) }

            Text(verbatim: line.text)
                .zoomFont(.body)
                .textSelection(.enabled)
                .foregroundStyle(line.isUser ? Color.white : Color.primary)
                .zoomPadding(.horizontal, 12)
                .zoomPadding(.vertical, 8)
                .background(
                    line.isUser ? Color.accentColor : Color.secondary.opacity(0.18),
                    in: RoundedRectangle(cornerRadius: 16 * CGFloat(scale), style: .continuous)
                )
                .contextMenu {
                    if let text = copyText {
                        Button("Copy", systemImage: "doc.on.doc") { Diagnostics.copy(text) }
                    }
                }
                .accessibilityLabel("\(line.isUser ? "You" : "Tutor"): \(line.text)")
                .accessibilityIdentifier("chat-queue-message-\(line.id)")

            if !line.isUser { Spacer(minLength: 48 * CGFloat(scale)) }
        }
        .frame(maxWidth: .infinity, alignment: line.isUser ? .trailing : .leading)
    }

    private var copyText: String? {
        line.isUser ? line.text : ChatQueueReplyCopy.text(for: line.text)
    }
}
