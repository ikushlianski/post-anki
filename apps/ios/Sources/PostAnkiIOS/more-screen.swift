import SwiftUI

struct MoreScreen: View {
    var body: some View {
        NavigationStack {
            List(MoreDestination.allCases) { destination in
                NavigationLink {
                    detail(for: destination)
                } label: {
                    Label(destination.title, systemImage: destination.systemImage)
                }
            }
            .navigationTitle("More")
        }
    }

    @ViewBuilder
    private func detail(for destination: MoreDestination) -> some View {
        switch destination {
        case .today: TodayScreen()
        case .progress: ProgressScreen(embedded: true)
        case .learningList: LearningListScreen()
        case .studySessions: StudySessionsScreen()
        case .notes: NotesSearchScreen()
        case .search: GlobalSearchScreen()
        case .tags: TagsScreen()
        case .duplicates: DuplicateReviewScreen()
        case .settings: SettingsScreen()
        }
    }
}
