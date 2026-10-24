import PostAnkiAPI
import SwiftUI

struct PendingReviewInboxSummary: View {
    let sources: [PendingReviewSource]
    let onStart: () -> Void

    var body: some View {
        let queue = FocusTriageQueue.build(sources: sources, pinnedBitId: nil)

        ZoomVStack(alignment: .leading, spacing: 8) {
            Text("\(queue.readyCount) \(queue.readyCount == 1 ? "card is" : "cards are") waiting for your decision")
                .zoomFont(.headline)

            if queue.waitingCount > 0 {
                Text("Writing cards… \(queue.readyCount) of \(queue.readyCount + queue.waitingCount) ready")
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)
            }

            Button(action: onStart) {
                Text("Start triage")
                    .zoomFont(.headline)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(queue.readyCount == 0)
        }
        .zoomPadding(.vertical, 4)
    }
}
