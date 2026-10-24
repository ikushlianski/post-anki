import SwiftUI

struct ReviewCountsStrip: View {
    let counts: ReviewRemainingCounts

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 16) {
                entry("New", counts.new)
                entry("Learning", counts.learning)
                entry("Due", counts.review)
            }

            Text(ReviewRemainingCounts.legend)
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("review-counts-strip")
    }

    private func entry(_ label: String, _ value: Int) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .foregroundStyle(.secondary)

            Text("\(value)")
                .fontWeight(.semibold)
        }
        .zoomFont(.subheadline)
    }
}
