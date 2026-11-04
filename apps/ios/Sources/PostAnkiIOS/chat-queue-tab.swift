import SwiftUI

struct ChatQueueTab: View {
    @State private var counts = ChatQueueCountStore.shared

    var body: some View {
        NavigationStack { ChatQueueScreen() }
            .tabItem {
                Label("Chat", systemImage: "bubble.left.and.bubble.right")
                    .accessibilityLabel(counts.badgeAccessibilityLabel)
            }
            .badge(counts.badgeText.map { Text($0) })
    }
}
