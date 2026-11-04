import SwiftUI

struct ReviewCountsStrip: View {
    let counts: ReviewRemainingCounts
    @State private var showsLegend = false

    var body: some View {
        HStack(spacing: 16) {
            HStack(spacing: 16) {
                entry("New", counts.new)
                entry("Learning", counts.learning)
                entry("Due", counts.review)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("review-counts-strip")

            Button {
                showsLegend = true
            } label: {
                Image(systemName: "info.circle")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .accessibilityLabel("What New, Learning and Due mean")
            .accessibilityIdentifier("review-counts-legend-button")
            .popover(isPresented: $showsLegend) {
                Text(ReviewRemainingCounts.legend)
                    .zoomFont(.callout)
                    .padding()
                    .frame(minWidth: 240)
                    .presentationCompactAdaptation(.popover)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
