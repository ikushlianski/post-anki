import SwiftUI

struct DueReviewKnownSideButton: View {
    let model: DueReviewModel

    var body: some View {
        Button {
            Task { await model.markCurrentKnown() }
        } label: {
            Image(systemName: "checkmark.seal.fill")
                .zoomFont(.title3)
                .frame(width: 36, height: 88)
        }
        .buttonStyle(.bordered)
        .tint(.green)
        .disabled(model.isGrading || model.current?.isRehearsal == true)
        .accessibilityIdentifier("due-review-known")
        .accessibilityLabel("I already know it")
        .accessibilityHint("Hides this card for 6 to 12 months")
        .padding(.horizontal, 4)
    }
}

extension View {
    func dueReviewKnownSide(model: DueReviewModel) -> some View {
        HStack(spacing: 0) {
            self

            if model.current != nil {
                DueReviewKnownSideButton(model: model)
            }
        }
    }
}
