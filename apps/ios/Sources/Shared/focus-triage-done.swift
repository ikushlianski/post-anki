import SwiftUI

struct FocusTriageDone: View {
    let remaining: Int
    let waitingCount: Int
    let decidedCount: Int
    @Binding var feedback: String
    let isSaving: Bool
    let resumed: Bool
    let error: String?
    let stale: Bool
    let rows: [FocusTriageDecisionRow]
    let editing: FocusTriageDecisionEditing
    let onFinish: () -> Void
    let onDiscard: () -> Void

    var body: some View {
        ScrollView {
            ZoomVStack(alignment: .leading, spacing: 12) {
                if isAllDone {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.green)
                        .accessibilityHidden(true)
                }

                Text(title)
                    .zoomFont(.title2.weight(.semibold))

                Text(detail)
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)

                if resumed {
                    Text("This session was open before the app closed. Decisions made earlier are still counted.")
                        .zoomFont(.callout)
                        .foregroundStyle(.secondary)
                }

                FocusTriageDecisionList(rows: rows, editing: editing)

                Text("Feedback (optional)")
                    .zoomFont(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                TextField("What did you like or not like about these cards? Helps future cards.", text: $feedback, axis: .vertical)
                    .lineLimit(4...10)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: feedback) {
                        if feedback.count > FocusTriageFeedback.maxCharacters {
                            feedback = String(feedback.prefix(FocusTriageFeedback.maxCharacters))
                        }
                    }

                if let error {
                    Text(error)
                        .zoomFont(.callout)
                        .foregroundStyle(.red)
                }

                if stale {
                    Text("This session no longer exists or is already finished.")
                        .zoomFont(.callout)
                    Button("Discard this session", action: onDiscard)
                        .buttonStyle(.bordered)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .zoomPadding()
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            MainActionControls(tiles: [
                MainActionTile(
                    title: "Done",
                    style: .prominent,
                    isLoading: isSaving,
                    isDisabled: isSaving,
                    action: onFinish
                )
            ])
        }
    }

    private var isAllDone: Bool { remaining == 0 && waitingCount == 0 }

    private var title: String {
        if remaining > 0 { return "Finish triage" }

        return waitingCount > 0 ? "Writing more cards…" : "All done"
    }

    private var detail: String {
        if remaining > 0 {
            return "\(remaining) \(remaining == 1 ? "card is" : "cards are") still waiting for your decision. You can pick them up later from the inbox."
        }

        if waitingCount > 0 {
            return "\(waitingCount) \(waitingCount == 1 ? "suggestion is" : "suggestions are") still being written. They will show up here when ready, or you can finish now."
        }

        if decidedCount > 0 {
            return "You went through \(decidedCount) \(decidedCount == 1 ? "card" : "cards"). Finish to wrap up this session."
        }

        return "There is nothing left to review. Finish to wrap up this session."
    }
}
