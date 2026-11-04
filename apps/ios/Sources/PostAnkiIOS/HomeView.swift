import PostAnkiAPI
import SwiftUI

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab = HomeTab.review
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
        TabView(selection: $selectedTab) {
            KnowledgeInboxScreen(onTriageFinished: { selectedTab = .review })
                .tabItem { Label("Triage", systemImage: "tray.full") }
                .badge(PendingReviewCountStore.shared.badgeCount)
                .tag(HomeTab.triage)

            ReviewSubjectsScreen { DueReviewScreen(scope: $0, aheadDays: $1) }
                .tabItem { Label("Review", systemImage: "checkmark.seal") }
                .tag(HomeTab.review)

            NavigationStack { IngestionDictationScreen() }
                .tabItem { Label("Add", systemImage: "square.and.pencil") }
                .tag(HomeTab.add)

            ChatQueueTab()
                .tag(HomeTab.chat)

            MoreScreen()
                .tabItem { Label("More", systemImage: "ellipsis") }
                .tag(HomeTab.more)
        }
        .task {
            await PendingReviewCountStore.shared.refresh()
            await ChatQueueCountStore.shared.refresh()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await ChatQueueCountStore.shared.refresh() }
                Task { await PendingAnswerQueue.shared.flush() }
                Task { await DueBadge.refresh() }
            }
        }
    }
}
