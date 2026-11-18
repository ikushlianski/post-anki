import SwiftUI

struct DueReviewShuffleToggle: View {
    let model: DueReviewModel

    var body: some View {
        Toggle(
            isOn: Binding(
                get: { model.shuffleSeed != nil },
                set: { value in Task { await model.setShuffle(value) } }
            )
        ) {
            Label("Shuffle", systemImage: "shuffle")
        }
        .toggleStyle(.button)
        .disabled(model.isGrading || model.state == .loading)
        .accessibilityIdentifier("due-review-shuffle")
        .accessibilityHint("Mixes today's cards, favouring recent ones")
    }
}
