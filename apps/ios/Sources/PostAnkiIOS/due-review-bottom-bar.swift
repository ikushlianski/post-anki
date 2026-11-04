import SwiftUI

struct DueReviewBottomBar: View {
    let model: DueReviewModel

    var body: some View {
        VStack(spacing: 0) {
            if model.reviewedCount > 0 {
                Text("\(model.reviewedCount) reviewed this session")
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(.bar)
            }

            if model.isRevealed {
                DueReviewGradeBar(tiles: gradeTiles)
            } else {
                MainActionControls(
                    tiles: [MainActionTile(title: "Show Answer", style: .prominent) { model.reveal() }],
                    extendsIntoBottomSafeArea: false
                )
            }
        }
    }

    private var gradeTiles: [MainActionTile] {
        let rehearsal = model.current?.isRehearsal == true

        return DueReviewGradeOptions.options(rehearsal: rehearsal).map { option in
            MainActionTile(
                title: option.title,
                isDisabled: model.isGrading,
                tint: DueReviewGradeOptions.tint(for: option.grade),
                caption: rehearsal ? nil : DueReviewGradeOptions.intervalCaption(for: option.grade, preview: model.current?.intervalPreview)
            ) {
                Task { await model.grade(option.grade) }
            }
        }
    }
}
