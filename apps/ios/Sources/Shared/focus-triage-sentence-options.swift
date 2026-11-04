import PostAnkiAPI
import SwiftUI

struct FocusTriageSentenceOptions: View {
    let variants: [PendingReviewVariant]
    var phrase = ""
    let selectedIndex: Int
    let onSelect: (Int) -> Void

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 10) {
            ForEach(Array(variants.enumerated()), id: \.element.id) { index, variant in
                PendingReviewTriageOptionRow(
                    variant: variant,
                    phrase: phrase,
                    isSelected: index == selectedIndex,
                    onTap: { onSelect(index) }
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Answer options")
    }
}
