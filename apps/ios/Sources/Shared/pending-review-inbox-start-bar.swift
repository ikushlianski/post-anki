import PostAnkiAPI
import SwiftUI

struct PendingReviewInboxStartBar: View {
    let sources: [PendingReviewSource]
    let subjectId: String?
    let resumed: FocusTriageStoredSession?
    let isStarting: Bool
    let hasError: Bool
    let onStart: () -> Void

    private var shownSubject: String? {
        if let resumed { return resumed.subjectId }

        return PendingReviewInboxSummary.validSubject(subjectId, in: sources)
    }

    private var buttonTitle: String {
        if resumed != nil { return "Resume triage" }

        return hasError ? "Try again" : "Start triage"
    }

    var body: some View {
        let queue = FocusTriageQueue.build(sources: sources, pinnedBitId: nil, subjectId: shownSubject)

        MainActionControls(tiles: [
            MainActionTile(
                title: buttonTitle,
                style: .prominent,
                isLoading: isStarting,
                isDisabled: queue.readyCount == 0 && resumed == nil,
                action: onStart
            )
        ])
    }
}
