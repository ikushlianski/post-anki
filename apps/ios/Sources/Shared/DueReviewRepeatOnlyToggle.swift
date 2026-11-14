import SwiftUI

struct DueReviewRepeatOnlyToggle: View {
    let model: DueReviewModel

    var body: some View {
        Toggle(
            isOn: Binding(
                get: { model.repeatOnly },
                set: { value in Task { await model.setRepeatOnly(value) } }
            )
        ) {
            Label("Repeats only", systemImage: "arrow.triangle.2.circlepath")
        }
        .toggleStyle(.button)
        .disabled(model.isGrading || model.state == .loading)
        .accessibilityIdentifier("due-review-repeat-only")
        .accessibilityHint("Hides cards you have never studied")
    }
}
