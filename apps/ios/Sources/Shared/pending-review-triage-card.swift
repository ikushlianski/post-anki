import PostAnkiAPI
import SwiftUI

struct PendingReviewTriageCard: View {
    let number: Int
    let label: String
    let variant: PendingReviewVariant
    let isSelected: Bool
    let onTap: () -> Void

    @ZoomMetric private var corner: CGFloat = 16

    var body: some View {
        ZoomHStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .zoomFont(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(isSelected ? Color.accentColor : .secondary)

            ZoomVStack(alignment: .leading, spacing: 10) {
                CardContextLine(text: variant.face.context)

                QuestionAnswerRow(kind: .question) {
                    Text(variant.face.front)
                        .zoomFont(.title.weight(.semibold))
                        .multilineTextAlignment(.leading)
                }
                QuestionAnswerRow(kind: .answer) {
                    Text(variant.answer)
                        .zoomFont(.title2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }

                CopyAllButton(parts: [variant.face.context, variant.face.front, variant.answer])
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
            .cardCopyMenu(question: variant.face.front, answer: variant.answer)

            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .zoomFont(.title2)
                .foregroundStyle(isSelected ? Color.accentColor : .secondary)
        }
        .zoomPadding(20)
        .background(isSelected ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: corner))
        .overlay(
            RoundedRectangle(cornerRadius: corner)
                .stroke(isSelected ? Color.accentColor : .clear, lineWidth: 2)
        )
        .contentShape(RoundedRectangle(cornerRadius: corner))
        .onTapGesture(perform: onTap)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(number). \(variant.face.front)")
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
        .accessibilityAction(.default, onTap)
    }
}
