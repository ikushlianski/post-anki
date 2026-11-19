import SwiftUI

struct DueReviewShuffleButton: View {
    let model: DueReviewModel

    var body: some View {
        Button {
            model.shuffleRemaining()
        } label: {
            Label("Shuffle", systemImage: "shuffle")
        }
        .disabled(model.isGrading || model.state != .card || model.queue.count < 2)
        .accessibilityIdentifier("due-review-shuffle")
        .accessibilityHint("Mixes the cards you have not answered yet")
    }
}
