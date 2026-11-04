import PostAnkiAPI
import SwiftUI

struct NotionSourceRowContent: View {
    let source: NotionIngestionSource
    let isRunning: Bool
    let outcome: NotionRunOutcome?

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(source.name).zoomFont(.headline)

                if source.paused {
                    Text("Paused")
                        .zoomFont(.caption)
                        .foregroundStyle(.orange)
                }
            }

            if let url = NotionSourceText.safeHttpURL(source.pageUrl) {
                Link(source.pageUrl, destination: url)
                    .zoomFont(.caption)
                    .lineLimit(2)
                    .truncationMode(.middle)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text(source.pageUrl)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .truncationMode(.middle)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Text(source.subjectPath.joined(separator: SubjectTreePath.separator))
                .zoomFont(.subheadline)
                .foregroundStyle(.secondary)
            Text("\(source.itemsPerRun) items per run, \(source.frequency.label.lowercased()). \(source.removeAfterImport ? "Removes imported items from Notion." : "Keeps the Notion page unchanged.")")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
            Text(NotionSourceText.lastRun(source.lastRun))
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            if let failure = NotionSourceText.lastRunFailure(source.lastRun) {
                Text(failure)
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
            }

            if let next = NotionSourceText.nextRun(source) {
                Text(next)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            if isRunning {
                HStack {
                    ProgressView().controlSize(.small)
                    Text("Ingesting...").zoomFont(.caption)
                }
            } else if let outcome {
                switch outcome {
                case .result(let result):
                    Text(NotionSourceText.summary(result)).zoomFont(.caption)
                case .failure(let message):
                    Text(message).zoomFont(.caption).foregroundStyle(.red)
                }
            }
        }
    }
}
