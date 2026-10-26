import PostAnkiAPI
import SwiftUI

struct AttentionNoticeRow: View {
    let source: PendingReviewSource
    let attention: KnowledgeSourceAttention
    let phase: AttentionRetryPhase?
    let discardError: String?
    let onRetry: () -> Void
    let onEdit: () -> Void
    let onDiscard: () -> Void

    private var isRetrying: Bool { phase == .starting || phase == .running }

    private var fullText: String { attention.sourceText ?? source.sourceText ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(attention.firstWords.isEmpty ? "Untitled note" : attention.firstWords)
                .font(.headline)
                .lineLimit(2)

            Text(AttentionWording.age(since: attention.since))
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(attention.wording)
                .font(.subheadline)
                .foregroundStyle(attention.isInformational ? Color.blue : Color.primary)

            if !fullText.isEmpty {
                DisclosureGroup("Show note text") {
                    Text(fullText)
                        .font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(.footnote)
            }

            if isRetrying {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Retrying…").font(.footnote).foregroundStyle(.secondary)
                }
            }

            if case .failed(let message) = phase {
                Text(message).font(.footnote).foregroundStyle(.red)
            }

            if let discardError {
                Text(discardError).font(.footnote).foregroundStyle(.red)
            }

            if !attention.isInformational && !isRetrying {
                HStack(spacing: 8) {
                    Button("Retry", action: onRetry)
                    Button("Edit & retry", action: onEdit)
                    Button("Discard", role: .destructive, action: onDiscard)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }
}
