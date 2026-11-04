import PostAnkiAPI
import SwiftUI

struct ChatQueueSearchResults: View {
    let state: ChatQueueSearchState
    let items: [ChatQueueItem]
    let thread: (ChatQueueItem) -> AnyView

    var body: some View {
        switch state {
        case .idle:
            EmptyView()
        case .loading:
            ProgressView()
                .accessibilityIdentifier("chat-queue-search-loading")
        case .failed(let message):
            Text(message)
                .zoomFont(.caption)
                .foregroundStyle(.red)
                .accessibilityIdentifier("chat-queue-search-error")
        case .ready(let hits, _) where hits.isEmpty:
            Text("No conversation matches.")
                .zoomFont(.body)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("chat-queue-search-empty")
        case .ready(let hits, let isCut):
            if isCut {
                Text(ChatQueueSearchResponse.cutNotice)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("chat-queue-search-cut-notice")
            }

            ForEach(hits) { hit in
                if let item = items.first(where: { $0.id == hit.cardId }) {
                    NavigationLink { thread(item) } label: { ChatQueueSearchRow(hit: hit, cardBody: item.body) }
                        .accessibilityIdentifier("chat-queue-hit-\(hit.id)")
                } else {
                    ChatQueueSearchRow(hit: hit, cardBody: "Card")
                }
            }
        }
    }
}

private struct ChatQueueSearchRow: View {
    let hit: ChatQueueSearchHit
    let cardBody: String

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            Text(verbatim: cardBody)
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Text(verbatim: "\(hit.roleLabel): \(hit.snippet)")
                .zoomFont(.body)
                .lineLimit(3)
        }
        .accessibilityElement(children: .combine)
    }
}
