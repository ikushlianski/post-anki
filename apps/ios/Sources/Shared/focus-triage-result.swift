import PostAnkiAPI
import SwiftUI

struct FocusTriageResult: View {
    let result: TriageSessionResponse
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            ZoomVStack(alignment: .leading, spacing: 12) {
                Text("Triage saved")
                    .zoomFont(.title2.weight(.semibold))

                Text("\(result.acceptedCount) accepted, \(result.rejectedCount) rejected.")
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)

                if result.notes.isEmpty {
                    Text("No new style notes came out of this session.")
                        .zoomFont(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Style notes")
                        .zoomFont(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    ForEach(result.notes) { note in
                        Text("• \(note.text)")
                            .zoomFont(.callout)
                    }
                }

                Button(action: onDone) {
                    Text("Done")
                        .zoomFont(.headline)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .zoomPadding()
        }
    }
}
