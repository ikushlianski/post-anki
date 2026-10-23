import SwiftUI

struct SourceDuplicateList: View {
    let model: DuplicateReviewModel

    var body: some View {
        if model.hasLoaded && model.sourcePairs.isEmpty {
            Text("No possible duplicate sources.").foregroundStyle(.secondary)
        }

        ForEach(model.sourcePairs) { pair in
            ZoomVStack(alignment: .leading, spacing: 6) {
                Text(model.sourceName(pair.sourceAId)).zoomFont(.headline)
                Text(model.sourceName(pair.sourceBId)).zoomFont(.headline)

                Text(pair.matchText).zoomFont(.subheadline)

                Text(pair.reason).zoomFont(.caption).foregroundStyle(.secondary)

                HStack {
                    Button("Acknowledge") { Task { await model.resolveSource(pair, acknowledged: true) } }
                        .buttonStyle(.bordered)

                    Button("Dismiss") { Task { await model.resolveSource(pair, acknowledged: false) } }
                        .buttonStyle(.bordered)
                }
            }
            #if os(macOS)
            .contextMenu {
                Button("Acknowledge") { Task { await model.resolveSource(pair, acknowledged: true) } }
                Button("Dismiss") { Task { await model.resolveSource(pair, acknowledged: false) } }
            }
            #endif
        }
    }
}
