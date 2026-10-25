#if DEBUG
import SwiftUI

@MainActor
private func previewReviewModel(revealed: Bool) -> DueReviewModel {
    let model = DueReviewModel()

    model.state = .card
    model.current = PreviewSampleData.reviewCard
    model.isRevealed = revealed
    model.reviewedCount = 3

    return model
}

private struct ReviewPreview: View {
    let model: DueReviewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ReviewCountsStrip(counts: ReviewRemainingCounts(new: 5, learning: 2, review: 11))
                    .padding(.horizontal)
                    .padding(.top, 8)

                ScrollView {
                    if let card = model.current {
                        DueReviewCardBody(
                            model: model,
                            card: card,
                            answerInput: { EmptyView() },
                            revealedFooter: { EmptyView() },
                            unrevealed: {
                                Button("Show answer") {}
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.large)
                            }
                        )
                    }
                }
            }
        }
    }
}

#Preview("Review: question") {
    ReviewPreview(model: previewReviewModel(revealed: false))
}

#Preview("Review: answer shown") {
    ReviewPreview(model: previewReviewModel(revealed: true))
}
#endif
