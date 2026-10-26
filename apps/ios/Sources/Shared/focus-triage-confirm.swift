import SwiftUI

struct FocusTriageConfirm: View {
    let remaining: Int
    let decidedCount: Int

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            Text("Finish triage?")
                .zoomFont(.title2.weight(.semibold))

            Text(detail)
                .zoomFont(.callout)
                .foregroundStyle(.secondary)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .zoomPadding()
    }

    private var detail: String {
        let decided = "You decided on \(decidedCount) \(decidedCount == 1 ? "card" : "cards")."

        guard remaining > 0 else { return decided }

        return "\(decided) Cards you haven't decided on stay in the inbox for later."
    }
}
