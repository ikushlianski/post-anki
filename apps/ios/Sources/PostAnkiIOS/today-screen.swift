import SwiftUI

struct TodayScreen: View {
    @State private var dueModel = DueTodayModel()
    @State private var summaryModel = HomeSummaryModel()

    var body: some View {
        List {
            HomeSummarySection(model: summaryModel)

            Section { DueTodayRow(model: dueModel) }

            HomeDailySection()
        }
        .navigationTitle("Today")
        .refreshable {
            async let due: Void = dueModel.load()
            async let summary: Void = summaryModel.load()
            await due
            await summary
        }
        .task { await summaryModel.load() }
    }
}
