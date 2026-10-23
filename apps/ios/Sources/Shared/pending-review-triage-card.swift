import PostAnkiAPI
import SwiftUI

struct PendingReviewTriageCard: View {
    let number: Int
    let label: String
    let variant: PendingReviewVariant
    let isSelected: Bool
    let onTap: () -> Void

    @ZoomMetric private var corner: CGFloat = 12

    var body: some View {
        Button(action: onTap) {
            ZoomHStack(alignment: .top, spacing: 12) {
                Text("\(number)")
                    .zoomFont(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(isSelected ? Color.accentColor : .secondary)

                ZoomVStack(alignment: .leading, spacing: 4) {
                    Text(label)
                        .zoomFont(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(variant.prompt)
                        .zoomFont(.title3)
                        .multilineTextAlignment(.leading)
                    Text(variant.answer)
                        .zoomFont(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .zoomFont(.title2)
                    .foregroundStyle(isSelected ? Color.accentColor : .secondary)
            }
            .zoomPadding(14)
            .background(isSelected ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: corner))
            .overlay(
                RoundedRectangle(cornerRadius: corner)
                    .stroke(isSelected ? Color.accentColor : .clear, lineWidth: 2)
            )
            .contentShape(RoundedRectangle(cornerRadius: corner))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(number). \(label). \(variant.prompt)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
