import PostAnkiAPI
import SwiftUI

struct ProgressInsightsSections: View {
    let model: ProgressInsightsModel

    var body: some View {
        Section("Reject reasons") {
            InsightContent(state: model.rejectReasons, empty: { $0.total == 0 ? "No rejected cards yet" : nil }, retry: reload) { stats in
                ForEach(stats.reasons) { reason in
                    InsightBarRow(label: reason.label, trailing: "\(reason.count) (\(reason.percentText))", share: reason.share, speech: reason.summary)
                }
            }
        }

        Section("Notes that gave no cards") {
            InsightContent(state: model.nothingExtracted, empty: { $0.summary == nil ? NothingExtractedStatistics.emptyText : nil }, retry: reload) { stats in
                if let summary = stats.summary {
                    Text(summary).accessibilityIdentifier("progress-nothing-extracted")
                }
            }
        }

        Section("What happened to cards sent to Chat") {
            InsightContent(state: model.chatOutcomes, empty: { $0.total == 0 ? $0.emptyText : nil }, retry: reload) { stats in
                Text(stats.totalText).font(.subheadline).foregroundStyle(.secondary)

                ForEach(stats.rows) { row in
                    InsightBarRow(label: row.label, trailing: "\(row.count) (\(Int((row.share * 100).rounded()))%)", share: row.share, speech: row.summary)
                }
            }
        }
    }

    private func reload() {
        Task { await model.load() }
    }
}

private struct InsightContent<Value: Sendable, Rows: View>: View {
    let state: InsightState<Value>
    let empty: (Value) -> String?
    let retry: () -> Void
    @ViewBuilder let rows: (Value) -> Rows

    var body: some View {
        switch state {
        case .loading:
            ProgressView().accessibilityLabel("Loading")
        case .failed(let message):
            VStack(alignment: .leading, spacing: 6) {
                Text(message).font(.caption).foregroundStyle(.secondary)
                Button("Try again", action: retry)
            }
        case .ready(let value):
            if let text = empty(value) {
                Text(text).foregroundStyle(.secondary)
            } else {
                rows(value)
            }
        }
    }
}

private struct InsightBarRow: View {
    let label: String
    let trailing: String
    let share: Double
    let speech: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).font(.subheadline)
                Spacer()
                Text(trailing).font(.subheadline).monospacedDigit()
            }

            ProgressView(value: min(max(share, 0), 1)).accessibilityHidden(true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(speech)
    }
}
