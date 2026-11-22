import SwiftUI

struct TodayScreen: View {
    @State private var dueModel = DueTodayModel()
    @State private var summaryModel = HomeSummaryModel()
    @State private var subjectsModel = TodaySubjectsModel()

    var body: some View {
        List {
            HomeSummarySection(model: summaryModel)

            Section { DueTodayRow(model: dueModel) }

            TodaySubjectsSection(model: subjectsModel)

            HomeDailySection()
        }
        .navigationTitle("Today")
        .refreshable {
            async let due: Void = dueModel.load()
            async let summary: Void = summaryModel.load()
            async let subjects: Void = subjectsModel.refresh()
            await due
            await subjects
            await summary
        }
        .task { await summaryModel.load() }
        .task { await subjectsModel.load() }
        .onChange(of: subjectsModel.changeCount) { Task { await dueModel.load() } }
    }
}
