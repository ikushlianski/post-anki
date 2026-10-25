import SwiftUI

struct DueReviewBottomBar: View {
    let model: DueReviewModel

    var body: some View {
        if !model.isRevealed {
            MainActionControls(tiles: [
                MainActionTile(title: "Show Answer", style: .prominent) { model.reveal() }
            ])
        }
    }
}
