import PostAnkiAPI
import SwiftUI

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var isSignedIn = !SignInGate.needsSignIn(token: TokenStore.read())

    var body: some View {
        Group {
            if isSignedIn {
                tabs
            } else {
                SignInGateScreen()
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if BuildInfo.isDev {
                Color.orange.frame(height: 3)
            }
        }
        .tint(BuildInfo.isDev ? .orange : nil)
        .onReceive(NotificationCenter.default.publisher(for: .postAnkiSettingsDidSave)) { _ in
            isSignedIn = !SignInGate.needsSignIn(token: TokenStore.read())
            Task { await PendingReviewCountStore.shared.refresh() }
        }
    }

    private var tabs: some View {
        TabView {
            KnowledgeInboxScreen()
                .tabItem { Label("Triage", systemImage: "tray.full") }
                .badge(PendingReviewCountStore.shared.badgeCount)

            NavigationStack { IngestionDictationScreen() }
                .tabItem { Label("Add", systemImage: "square.and.pencil") }

            NavigationStack { DueReviewScreen() }
                .tabItem { Label("Review", systemImage: "checkmark.seal") }

            NavigationStack { KnowledgeListScreen() }
                .tabItem { Label("Knowledge", systemImage: "books.vertical") }

            SubjectsScreen()
                .tabItem { Label("Subjects", systemImage: "book") }

            MoreScreen()
                .tabItem { Label("More", systemImage: "ellipsis") }
        }
        .task { await PendingReviewCountStore.shared.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await PendingAnswerQueue.shared.flush() }
            }
        }
    }
}
