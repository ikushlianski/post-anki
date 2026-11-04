import SwiftUI

struct MoreScreen: View {
    var body: some View {
        NavigationStack {
            List {
                ForEach(MoreSection.allCases) { section in
                    Section(section.title) {
                        ForEach(section.destinations) { destination in
                            NavigationLink {
                                detail(for: destination)
                            } label: {
                                Label(destination.title, systemImage: destination.systemImage)
                            }
                        }
                    }
                }
            }
            .refreshable {
                await PendingReviewCountStore.shared.refresh()
                await ChatQueueCountStore.shared.refresh()
                await DueBadge.refresh()
            }
            .navigationTitle("More")
        }
    }

    @ViewBuilder
    private func detail(for destination: MoreDestination) -> some View {
        switch destination {
        case .knowledge: KnowledgeListScreen()
        case .subjects: SubjectsScreen(embedded: true)
        case .today: TodayScreen()
        case .progress: ProgressScreen(embedded: true)
        case .statistics: OwnerStatsScreen()
        case .learningList: LearningListScreen()
        case .studySessions: StudySessionsScreen()
        case .triageHistory: TriageHistoryScreen()
        case .studyPlan: StudyPlanSubjectPicker()
        case .notes: NotesSearchScreen()
        case .search: GlobalSearchScreen()
        case .tags: TagsScreen()
        case .duplicates: DuplicateReviewScreen()
        case .notionSources: NotionSourcesScreen()
        case .settings: SettingsScreen()
        case .account: AccountScreen()
        case .about: AboutScreen()
        }
    }
}
