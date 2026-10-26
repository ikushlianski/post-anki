import SwiftUI

struct KnowledgeInboxScreen: View {
    var body: some View {
        PendingReviewScreen()
            .task { await PendingReviewCountStore.shared.refresh() }
    }
}
