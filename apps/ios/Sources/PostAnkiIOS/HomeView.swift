import SwiftUI

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            HomeScreen()
                .tabItem { Label("Home", systemImage: "house") }

            CoursesScreen()
                .tabItem { Label("Courses", systemImage: "book") }

            PendingReviewScreen()
                .tabItem { Label("Review", systemImage: "checkmark.seal") }
                .badge(PendingReviewCountStore.shared.count)

            ProgressScreen()
                .tabItem { Label("Progress", systemImage: "chart.bar") }

            IngestScreen()
                .tabItem { Label("Ingest", systemImage: "tray.and.arrow.down") }

            KnowledgeItemInboxScreen()
                .tabItem { Label("Inbox", systemImage: "tray.full") }

        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await PendingAnswerQueue.shared.flush() }
            }
        }
    }
}
