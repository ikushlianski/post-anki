import SwiftUI

struct DueReviewBottomBar: View {
    @AppStorage(AnswerButtonSizeStore.key) private var sizeRaw = AnswerButtonSize.defaultSize.rawValue

    let model: DueReviewModel

    private var barHeight: CGFloat {
        max((AnswerButtonSize(rawValue: sizeRaw) ?? .defaultSize).height, AnswerButtonLayout.minHeight)
            + DueReviewGradeBar.verticalPadding * 2
            + 1
    }

    var body: some View {
        Group {
            if model.isRevealed {
                DueReviewGradeBar(tiles: gradeTiles)
            } else {
                DueReviewGradeBar(
                    tiles: [MainActionTile(title: "Show Answer", style: .prominent) { model.reveal() }]
                )
            }
        }
        .frame(height: barHeight)
        .transaction { $0.animation = nil }
    }

    private var gradeTiles: [MainActionTile] {
        let rehearsal = model.current?.isRehearsal == true

        var tiles = DueReviewGradeOptions.options(rehearsal: rehearsal).map { option in
            MainActionTile(
                title: option.title,
                isDisabled: model.isGrading,
                tint: DueReviewGradeOptions.tint(for: option.grade),
                caption: rehearsal ? nil : DueReviewGradeOptions.intervalCaption(for: option.grade, preview: model.current?.intervalPreview)
            ) {
                Task { await model.grade(option.grade) }
            }
        }

        if !rehearsal {
            let known = MainActionTile(
                title: "Known",
                isDisabled: model.isGrading,
                tint: .teal,
                systemImage: "checkmark.seal.fill",
                identifier: "due-review-known"
            ) {
                Task { await model.markCurrentKnown() }
            }

            tiles.append(known)
        }

        return tiles
    }
}
