import SwiftUI

struct KnowledgeInboxScreen: View {
    var onTriageFinished: (() -> Void)?

    var body: some View {
        PendingReviewScreen(onTriageFinished: onTriageFinished)
            .task { await PendingReviewCountStore.shared.refresh() }
    }
}
