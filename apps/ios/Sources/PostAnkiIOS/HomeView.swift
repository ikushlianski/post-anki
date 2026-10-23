import SwiftUI

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            HomeScreen()
                .tabItem { Label("Home", systemImage: "house") }

            CoursesScreen()
                .tabItem { Label("Courses", systemImage: "book") }

            NavigationStack { DueReviewScreen() }
                .tabItem { Label("Review", systemImage: "checkmark.seal") }

            ProgressScreen()
                .tabItem { Label("Progress", systemImage: "chart.bar") }

            IngestScreen()
                .tabItem { Label("Ingest", systemImage: "tray.and.arrow.down") }

            KnowledgeInboxScreen()
                .tabItem { Label("Knowledge Inbox", systemImage: "tray.full") }
                .badge(PendingReviewCountStore.shared.count)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await PendingAnswerQueue.shared.flush() }
            }
        }
    }
}
