import PostAnkiAPI
import SwiftUI

struct ChatQueueMessageBubble: View {
    let line: ChatQueueLine
    var onMakeCards: ((String) -> Void)?

    @Environment(\.zoomScale) private var scale

    var body: some View {
        HStack(spacing: 0) {
            if line.isUser { Spacer(minLength: 48 * CGFloat(scale)) }

            content
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

    @ViewBuilder
    private var content: some View {
        #if os(macOS)
        if !line.isUser, let onMakeCards {
            ChatQueueSelectableText(
                text: line.text,
                pointSize: ZoomFont.body.pointSize(scale: scale),
                onMakeCards: onMakeCards,
                onCopyReply: copyText.map { text in { Diagnostics.copy(text) } }
            )
        } else {
            plainText
        }
        #else
        plainText
        #endif
    }

    private var plainText: some View {
        Text(verbatim: line.text)
            .zoomFont(.body)
            .textSelection(.enabled)
    }

    private var copyText: String? {
        line.isUser ? line.text : ChatQueueReplyCopy.text(for: line.text)
    }
}
