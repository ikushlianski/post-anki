#if DEBUG
import PostAnkiAPI
import SwiftUI

private struct TriageCardPreview: View {
    @State private var note = ""

    var body: some View {
        VStack(spacing: 0) {
            Text("2 left to review")
                .font(.headline.monospacedDigit())
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()

            Divider()

            FocusTriageSwipeCard(isBusy: false, onDecide: { _ in true }, onFlownOff: {}) {
                FocusTriageCard(
                    bit: PreviewSampleData.pendingBit,
                    source: PreviewSampleData.pendingSources[0],
                    note: $note,
                    message: nil,
                    onEdit: {}
                )
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            MainActionControls(tiles: [
                MainActionTile(title: "Undo", isDisabled: true, action: {}),
                MainActionTile(title: "Finish", action: {})
            ])
        }
    }
}

private struct TriageInboxPreview: View {
    @State private var subjectId: String?

    var body: some View {
        NavigationStack {
            List {
                PendingReviewInboxSummary(
                    sources: PreviewSampleData.pendingSources,
                    subjectId: $subjectId,
                    resumed: nil
                )

                ForEach(PreviewSampleData.pendingSources) { source in
                    Section {
                        PendingReviewSourceHeader(source: source)

                        ForEach(source.bits) { bit in
                            PendingReviewBitRow(
                                bit: bit,
                                subjectName: source.subjectName,
                                isBusy: false,
                                message: nil,
                                onDecide: { _ in },
                                onEdit: {}
                            )
                        }
                    }
                }
            }
            .navigationTitle("Triage")
        }
    }
}

#Preview("Triage: swipe card") {
    TriageCardPreview()
}

#Preview("Triage: inbox list") {
    TriageInboxPreview()
}
#endif
