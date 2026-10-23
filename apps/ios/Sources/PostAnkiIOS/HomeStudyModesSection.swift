import SwiftUI

struct HomeStudyModesSection: View {
    var body: some View {
        Section("Study sessions and gaps") {
            NavigationLink {
                StudySessionsScreen()
            } label: {
                Label("Study sessions", systemImage: "timer")
            }

            NavigationLink {
                ResurfacingGapsScreen()
            } label: {
                Label("Gaps coming back", systemImage: "arrow.uturn.backward.circle")
            }
        }
    }
}
