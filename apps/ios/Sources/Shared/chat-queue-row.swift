import PostAnkiAPI
import SwiftUI

struct ChatQueueRow: View {
    let item: ChatQueueItem

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            Text(verbatim: item.body)
                .zoomFont(.body)
                .lineLimit(3)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)

            ZoomHStack(spacing: 6) {
                Text(verbatim: metaText)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                if item.reviewChat {
                    Text("From review")
                        .zoomFont(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(.quaternary, in: Capsule())
                        .accessibilityIdentifier("chat-queue-review-label")
                }
            }

            if item.isSnoozed(), let until = item.snoozedUntil {
                Text("Snoozed until \(until.formatted(date: .abbreviated, time: .omitted))")
                    .zoomFont(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var metaText: String {
        let turns = item.turnsLeft <= 0 ? "Limit reached" : "\(item.turnsLeft) left"

        return [item.subjectName, turns, ChatQueueWaiting.label(chatAt: item.chatAt)]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}

struct ChatQueueHeader: View {
    let summary: String?
    let wait: String?

    var body: some View {
        if summary != nil || wait != nil {
            ZoomVStack(alignment: .leading, spacing: 2) {
                if let summary {
                    Text(summary)
                        .zoomFont(.headline)
                        .accessibilityIdentifier("chat-queue-summary")
                }

                if let wait {
                    Text(wait)
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("chat-queue-oldest-wait")
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
    }
}
