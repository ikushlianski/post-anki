import PostAnkiAPI
import SwiftUI

struct PendingReviewTriageOptionRow: View {
    let variant: PendingReviewVariant
    var phrase = ""
    let isSelected: Bool
    let onTap: () -> Void

    @ZoomMetric private var corner: CGFloat = 12

    var body: some View {
        ZoomHStack(alignment: .top, spacing: 12) {
            Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                .zoomFont(.title3)
                .foregroundStyle(isSelected ? Color.accentColor : .secondary)

            CardRichText(text: variant.answer, font: .title3) {
                Text(TargetPhraseHighlight.attributed(variant.answer, phrase: phrase))
                    .zoomFont(.title3)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .copyMenu(variant.answer)
        }
        .zoomPadding(14)
        .frame(minHeight: 44)
        .background(isSelected ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: corner))
        .overlay(
            RoundedRectangle(cornerRadius: corner)
                .stroke(isSelected ? Color.accentColor : .clear, lineWidth: 2)
        )
        .contentShape(RoundedRectangle(cornerRadius: corner))
        .onTapGesture(perform: onTap)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(variant.answer)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
        .accessibilityAction(.default, onTap)
    }
}

struct PendingReviewTriageOptions: View {
    let selection: PendingReviewTriageSelection
    var phrase = ""
    let onSelect: (Int) -> Void

    var body: some View {
        content.textSelection(.enabled)
    }

    @ViewBuilder
    private var content: some View {
        if selection.variesByOption, let variant = selection.selectedVariant {
            ZoomVStack(alignment: .leading, spacing: 16) {
                CardContextLine(text: variant.face.context)

                QuestionAnswerRow(kind: .question) {
                    CardRichText(text: variant.face.front, font: .title.weight(.semibold)) {
                        Text(variant.face.front)
                            .zoomFont(.title.weight(.semibold))
                            .multilineTextAlignment(.leading)
                    }
                }

                QuestionAnswerRow(kind: .answer) {
                    CardRichText(text: variant.answer, font: .title2) {
                        Text(TargetPhraseHighlight.attributed(variant.answer, phrase: phrase))
                            .zoomFont(.title2)
                            .multilineTextAlignment(.leading)
                    }
                }

                TriageVariantIndicator(index: selection.selectedIndex ?? 0, count: selection.shown.count, onSelect: onSelect)
            }
        } else {
            sharedFrontRows
        }
    }

    private var sharedFrontRows: some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            if let face = selection.shown.first?.face {
                CardContextLine(text: face.context)

                QuestionAnswerRow(kind: .question) {
                    Text(face.front)
                        .zoomFont(.title2)
                        .multilineTextAlignment(.leading)
                }
            }

            ForEach(Array(selection.shown.enumerated()), id: \.element.id) { index, variant in
                PendingReviewTriageOptionRow(
                    variant: variant,
                    phrase: phrase,
                    isSelected: selection.isSelected(variant.id),
                    onTap: { onSelect(index) }
                )
            }
        }
    }
}
