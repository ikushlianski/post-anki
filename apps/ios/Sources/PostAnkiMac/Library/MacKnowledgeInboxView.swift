import SwiftUI

struct MacKnowledgeInboxView: View {
    var body: some View {
        PendingReviewScreen()
            .navigationTitle("Knowledge Inbox")
            .task { await PendingReviewCountStore.shared.refresh() }
    }
}
