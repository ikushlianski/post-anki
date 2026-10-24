import SwiftUI

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            HomeScreen()
                .tabItem { Label("Home", systemImage: "house") }

            NavigationStack { DueReviewScreen() }
                .tabItem { Label("Review", systemImage: "checkmark.seal") }

            KnowledgeInboxScreen()
                .tabItem { Label("Inbox", systemImage: "tray.full") }
                .badge(PendingReviewCountStore.shared.count)

            NavigationStack { IngestionDictationScreen() }
                .tabItem { Label("Add", systemImage: "square.and.pencil") }

            CoursesScreen()
                .tabItem { Label("Courses", systemImage: "book") }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await PendingAnswerQueue.shared.flush() }
            }
        }
    }
}
