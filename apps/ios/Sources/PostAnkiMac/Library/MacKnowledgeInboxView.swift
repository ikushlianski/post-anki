import SwiftUI

struct MacKnowledgeInboxView: View {
    let onTriageFinished: () -> Void

    var body: some View {
        PendingReviewScreen(onTriageFinished: onTriageFinished)
            .navigationTitle("Knowledge Inbox")
            .task { await PendingReviewCountStore.shared.refresh() }
    }
}
