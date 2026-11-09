import PostAnkiAPI
import SwiftUI

struct ChatQueueCardHeader: View {
    let item: ChatQueueItem

    @State private var expanded = false

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            Text(verbatim: item.body)
                .zoomFont(.body.weight(.semibold))
                .lineLimit(expanded ? nil : 3)
                .textSelection(.enabled)

            if expanded, let example = item.background, !example.isEmpty {
                Text(verbatim: example)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            HStack(spacing: 8) {
                Text(ChatQueueWaiting.label(chatAt: item.chatAt))
                    .accessibilityIdentifier("chat-queue-thread-waiting")

                if let title = item.sourceTitle, !title.isEmpty { sourceLine(title: title, link: item.sourceLink) }

                Spacer(minLength: 0)

                Button(expanded ? "Less" : "More") { expanded.toggle() }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.accentColor)
                    .accessibilityIdentifier("chat-queue-card-header-toggle")
            }
            .zoomFont(.caption)
            .foregroundStyle(.secondary)
        }
        .zoomPadding(.horizontal, 12)
        .zoomPadding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }

    @ViewBuilder
    private func sourceLine(title: String, link: URL?) -> some View {
        Group {
            if let link {
                HStack(spacing: 4) {
                    Text("From")
                    Link(destination: link) { Text(verbatim: title).underline() }
                }
            } else {
                Text(verbatim: "From \(title)")
            }
        }
        .lineLimit(1)
        .accessibilityIdentifier("chat-queue-thread-source")
    }
}
