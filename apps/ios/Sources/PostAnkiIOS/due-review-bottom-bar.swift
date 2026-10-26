import SwiftUI

struct DueReviewBottomBar: View {
    let model: DueReviewModel

    var body: some View {
        if model.isRevealed {
            MainActionControls(tiles: gradeTiles, extendsIntoBottomSafeArea: false)
        } else {
            MainActionControls(
                tiles: [MainActionTile(title: "Show Answer", style: .prominent) { model.reveal() }],
                extendsIntoBottomSafeArea: false
            )
        }
    }

    private var gradeTiles: [MainActionTile] {
        DueReviewGradeOptions.ordered.map { option in
            MainActionTile(
                title: option.title,
                isDisabled: model.isGrading,
                tint: DueReviewGradeOptions.tint(for: option.grade)
            ) {
                Task { await model.grade(option.grade) }
            }
        }
    }
}
