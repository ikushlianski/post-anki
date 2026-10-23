import SwiftUI

enum KnowledgeInboxMode: String, CaseIterable, Identifiable {
    case pending = "Pending items"
    case placements = "Placement suggestions"

    static let defaultMode = KnowledgeInboxMode.pending

    var id: String { rawValue }
}

struct KnowledgeInboxModePicker: View {
    @Binding var mode: KnowledgeInboxMode

    var body: some View {
        Picker("Knowledge Inbox", selection: $mode) {
            ForEach(KnowledgeInboxMode.allCases) { mode in
                Text(mode.rawValue).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(maxWidth: 420)
        .zoomPadding()
    }
}

struct KnowledgeInboxScreen: View {
    @State private var mode = KnowledgeInboxMode.defaultMode

    var body: some View {
        VStack(spacing: 0) {
            KnowledgeInboxModePicker(mode: $mode)

            switch mode {
            case .pending:
                PendingReviewScreen()
            case .placements:
                KnowledgeItemInboxScreen()
            }
        }
        .task { await PendingReviewCountStore.shared.refresh() }
    }
}
