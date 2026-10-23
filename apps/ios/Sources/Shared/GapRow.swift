import PostAnkiAPI
import SwiftUI

struct GapRow: View {
    let gap: Gap

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(gap.label)

                if gap.wanted {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .accessibilityLabel("Wanted")
                }
            }

            HStack(spacing: 6) {
                Text(gap.statusText)

                if let concern = gap.concern {
                    Text(GapConcern.label(concern))
                }

                Text(gap.origin == "user" ? "Added by you" : "From AI")

                if let until = gap.deferredUntil, gap.triageState != "important",
                   let text = DueReviewModel.nextDueText(until) {
                    Text("Back \(text)")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}
