import PostAnkiAPI
import SwiftUI

struct TriageSubjectsSection: View {
    let model: TriageSubjectsModel
    var isStarting = false
    var startError: String?
    let onPick: (String) -> Void
    let onTriageAll: () -> Void

    var body: some View {
        Section {
            if let message = model.errorMessage, !model.hasLoaded {
                Text(message)
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)

                Button("Try again") { Task { await model.load() } }
            } else if !model.hasLoaded {
                ProgressView()
            }

            ForEach(model.rows) { row in
                Button { onPick(row.subjectId) } label: {
                    TriageSubjectRow(row: row)
                }
                .buttonStyle(.plain)
                .disabled(isStarting)
                .accessibilityLabel("\(row.path), \(TriageSubjectsText.pending(row.pendingCount))")
            }

            if let startError {
                Text(startError)
                    .zoomFont(.callout)
                    .foregroundStyle(.red)
            }

            Button(TriageSubjectsText.triageAll(model.totalPending), action: onTriageAll)
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .disabled(isStarting)
        } header: {
            Text("Choose a subject to triage")
        }
    }
}

private struct TriageSubjectRow: View {
    let row: PendingReviewSubjectCount

    var body: some View {
        ZoomHStack(spacing: 12) {
            ZoomVStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .zoomFont(.headline)

                if row.path != row.name {
                    Text(row.path)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 8)

            Text(TriageSubjectsText.pending(row.pendingCount))
                .zoomFont(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)

            Image(systemName: "chevron.right")
                .zoomFont(.caption)
                .foregroundStyle(.tertiary)
        }
        .zoomPadding(.vertical, 4)
        .contentShape(Rectangle())
    }
}
