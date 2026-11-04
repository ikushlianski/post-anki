import PostAnkiAPI
import SwiftUI

struct WeeklyDigestCard: View {
    let model: WeeklyDigestModel

    var body: some View {
        switch model.phase {
        case .failed:
            card { failure }
        case .loading:
            card { skeleton }
        case .loaded(let digest):
            card { stats(digest) }
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("This week").font(.subheadline.weight(.semibold))
            content()
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
    }

    private var failure: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(WeeklyDigestMessages.loadFailure)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("weekly-digest-error")

            Button(WeeklyDigestMessages.retry) { Task { await model.load() } }
                .buttonStyle(.borderless)
                .accessibilityIdentifier("weekly-digest-retry")
        }
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 4)
                    .fill(.quaternary)
                    .frame(height: 14)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityLabel("Loading this week's numbers")
    }

    private func stats(_ digest: WeeklyDigestSummary) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 0) {
                tile("Accepted", digest.current.accepted, previous: digest.previous.accepted)
                tile("Rejected", digest.current.rejected, previous: digest.previous.rejected)
                tile("Reviewed", digest.current.reviewed, previous: digest.previous.reviewed)
                tile("Chat", digest.chatBacklog, previous: nil)
            }

            if let line = digest.chatActivityLine {
                Text(line)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("weekly-digest-chat-activity")
            }

            if !digest.topRejectReasons.isEmpty {
                Text(rejectSummary(digest.topRejectReasons))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
    }

    private func rejectSummary(_ reasons: [WeeklyDigestRejectReason]) -> String {
        let parts = reasons.prefix(3).map { item in
            [item.label, "\(item.count)", item.deltaText].compactMap { $0 }.joined(separator: " ")
        }

        return "Top reasons: " + parts.joined(separator: " · ")
    }

    private func tile(_ title: String, _ value: Int, previous: Int?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(value)").font(.headline).monospacedDigit()
            Text(title).font(.caption2).foregroundStyle(.secondary)

            if let previous, WeeklyDigestDelta.line(current: value, previous: previous) != nil {
                let change = value - previous

                Text(change == 0 ? "±0" : change > 0 ? "+\(change)" : "\(change)")
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
