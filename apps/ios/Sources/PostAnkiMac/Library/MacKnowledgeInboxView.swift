import SwiftUI

struct MacKnowledgeInboxView: View {
    @State private var mode = KnowledgeInboxMode.defaultMode

    var body: some View {
        VStack(spacing: 0) {
            KnowledgeInboxModePicker(mode: $mode)

            switch mode {
            case .pending:
                PendingReviewScreen()
            case .placements:
                MacInboxView()
            }
        }
        .navigationTitle("Knowledge Inbox")
        .task { await PendingReviewCountStore.shared.refresh() }
    }
}
