#if DEBUG
import SwiftUI

#Preview("Knowledge: item detail") {
    NavigationStack {
        KnowledgeItemDetailScreen(
            item: PreviewSampleData.knowledgeItems[0],
            subjectName: "Swift",
            onStateChange: { _ in }
        )
    }
}
#endif
