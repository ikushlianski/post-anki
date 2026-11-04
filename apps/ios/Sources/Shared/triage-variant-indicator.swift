import SwiftUI

struct TriageVariantIndicator: View {
    let index: Int
    let count: Int
    let onSelect: (Int) -> Void

    var body: some View {
        ZoomHStack(spacing: 12) {
            Button { onSelect(index - 1) } label: { Image(systemName: "chevron.left") }
                .disabled(index <= 0)
                .accessibilityLabel("Previous variation")

            Button { onSelect(index + 1 < count ? index + 1 : 0) } label: {
                Text(TriageVariantFronts.positionLabel(index: index, count: count))
                    .zoomFont(.callout.weight(.semibold).monospacedDigit())
                    .zoomPadding(.horizontal, 8)
                    .frame(minHeight: 44)
            }
            .accessibilityLabel("Variation \(index + 1) of \(count). Shows the next one")

            Button { onSelect(index + 1) } label: { Image(systemName: "chevron.right") }
                .disabled(index >= count - 1)
                .accessibilityLabel("Next variation")
        }
        .buttonStyle(.borderless)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .center)
    }
}
