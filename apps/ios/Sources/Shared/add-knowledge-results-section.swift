import SwiftUI

struct AddKnowledgeResultsSection: View {
    @Bindable var model: IngestionDictationScreenModel

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 10) {
            Divider()

            Text("Cards from this source")
                .zoomFont(.title3)
                .fontWeight(.semibold)

            if model.hasSent {
                sent
            } else {
                Text("Nothing here yet. Submit some knowledge above and the cards it produces will show up for review.")
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var sent: some View {
        ZoomVStack(alignment: .leading, spacing: 10) {
            Text(model.isDetecting
                ? "Sent. Extracting items..."
                : "Added. Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            if let summaryText = model.summaryText {
                Text(summaryText).zoomFont(.caption)
            }

            Button("Review new items") { model.showReview = true }
                .disabled(model.isDetecting)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .zoomPadding(14)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
}
