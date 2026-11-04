import PostAnkiAPI
import SwiftUI

struct ProgressScreen: View {
    var embedded = false
    @State private var model = ProgressModel()
    @State private var insights = ProgressInsightsModel()
    @State private var daily = DailyReviewsModel()
    @State private var forecast = DueForecastModel()
    @State private var maturity = CardMaturityModel()

    var body: some View {
        if embedded {
            screen
        } else {
            NavigationStack { screen }
        }
    }

    private var screen: some View {
        content
            .navigationTitle("Progress")
            .task {
                async let insightsLoad: Void = insights.load()
                async let dailyLoad: Void = daily.load()
                async let forecastLoad: Void = forecast.load()
                async let maturityLoad: Void = maturity.load()
                await model.load()
                await insightsLoad
                await dailyLoad
                await forecastLoad
                await maturityLoad
            }
    }

    @ViewBuilder
    private var content: some View {
        if let failure = model.failure, !model.hasLoaded {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(failure.message)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else {
            list
        }
    }

    private var list: some View {
        List {
            if let failure = model.sectionFailure {
                Text(failure.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let digest = model.digest {
                digestSections(digest)
            }

            if let retention = model.retention {
                Section("Retention (all time)") { retentionRows(retention) }
            }

            CardMaturitySection(model: maturity)

            DueForecastSection(model: forecast)

            DailyReviewsSection(model: daily)

            ProgressInsightsSections(model: insights)

            milestonesSection
        }
        .refreshable {
            async let insightsLoad: Void = insights.load()
            async let dailyLoad: Void = daily.load()
            async let forecastLoad: Void = forecast.load()
            async let maturityLoad: Void = maturity.load()
            await model.load()
            await insightsLoad
            await dailyLoad
            await forecastLoad
            await maturityLoad
        }
    }

    @ViewBuilder
    private func digestSections(_ digest: WeeklyDigest) -> some View {
        Section("This week") {
            HStack(alignment: .top) {
                DigestTile(
                    title: "Retention",
                    value: digest.retention.flatMap { $0.count > 0 ? $0.percentText : nil },
                    detail: digest.retention.flatMap { $0.count > 0 ? CountLabel.text($0.count, "item") : nil }
                )
                DigestTile(
                    title: "To mastery",
                    value: digest.timeToMastery.flatMap { $0.count > 0 ? $0.hoursText : nil },
                    detail: nil
                )
            }

            HStack(alignment: .top) {
                DigestTile(title: "Streak", value: CountLabel.text(digest.streak.currentStreak, "day"), detail: nil)
                DigestTile(
                    title: "Coverage",
                    value: digest.averageCoverage.map { "\($0)%" },
                    detail: nil
                )
            }
        }

        if !digest.coverage.isEmpty {
            Section("Coverage") {
                ForEach(digest.coverage) { CoverageRow(area: $0) }
            }
        }

        let concerns = digest.concerns.filter { $0.total > 0 }

        if !concerns.isEmpty {
            Section("Concerns") {
                ForEach(concerns) { ConcernRow(concern: $0) }
            }
        }
    }

    @ViewBuilder
    private func retentionRows(_ report: RetentionReport) -> some View {
        if let overall = report.overall, overall.count > 0 {
            StatLine(title: "Average retention", value: overall.percentText)
            StatLine(title: "Median retention", value: overall.medianPercentText)
        }

        if let mastery = report.timeToMasteryOverall, mastery.count > 0 {
            StatLine(title: "Average time to mastery", value: mastery.hoursText)
            StatLine(title: "Median time to mastery", value: mastery.medianHoursText)
        }

        if (report.overall?.count ?? 0) == 0 && (report.timeToMasteryOverall?.count ?? 0) == 0 {
            Text("No data yet")
                .foregroundStyle(.secondary)
        }
    }

    private var milestonesSection: some View {
        Section("Milestones") {
            if model.milestones.isEmpty {
                ContentUnavailableView(
                    "No milestones yet",
                    systemImage: "trophy",
                    description: Text("Master every topic in a subject to earn one.")
                )
            } else {
                ForEach(model.milestones) { MilestoneRow(milestone: $0) }
            }
        }
    }
}
