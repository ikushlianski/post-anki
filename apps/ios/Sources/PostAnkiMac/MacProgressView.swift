import PostAnkiAPI
import SwiftUI

struct MacProgressView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    @State private var model = ProgressModel()

    var body: some View {
        content
            .navigationTitle("Progress")
            .toolbar {
                ToolbarItem {
                    Button {
                        Task { await model.load() }
                    } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
                }
            }
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if let failure = model.failure, !model.hasLoaded {
            MacLoadStateView(failure: failure) { Task { await model.load() } }
        } else if !model.hasLoaded {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                ZoomVStack(alignment: .leading, spacing: 24) {
                    if let failure = model.sectionFailure {
                        Text(failure.macDetail)
                            .zoomFont(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let digest = model.digest {
                        tiles(digest)
                        coverage(digest)
                        concerns(digest)
                    }

                    if let retention = model.retention {
                        retentionSection(retention)
                    }

                    milestonesSection
                }
                .frame(maxWidth: 900 * zoom, alignment: .leading)
                .zoomPadding(24)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func tiles(_ digest: WeeklyDigest) -> some View {
        card("This week") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160 * zoom), alignment: .top)], spacing: 16) {
                DigestTile(title: "Streak", value: "\(digest.streak.currentStreak) days", detail: nil)
                DigestTile(
                    title: "Retention",
                    value: digest.retention.flatMap { $0.count > 0 ? $0.percentText : nil },
                    detail: digest.retention.flatMap { $0.count > 0 ? "\($0.count) items" : nil }
                )
                DigestTile(
                    title: "To mastery",
                    value: digest.timeToMastery.flatMap { $0.count > 0 ? $0.hoursText : nil },
                    detail: nil
                )
                DigestTile(title: "Coverage", value: digest.averageCoverage.map { "\($0)%" }, detail: nil)
            }
        }
    }

    @ViewBuilder
    private func coverage(_ digest: WeeklyDigest) -> some View {
        if !digest.coverage.isEmpty {
            card("Coverage") {
                ZoomVStack(spacing: 12) {
                    ForEach(digest.coverage) { CoverageRow(area: $0) }
                }
            }
        }
    }

    @ViewBuilder
    private func concerns(_ digest: WeeklyDigest) -> some View {
        let items = digest.concerns.filter { $0.total > 0 }

        if !items.isEmpty {
            card("Concerns") {
                ZoomVStack(spacing: 8) {
                    ForEach(items) { ConcernRow(concern: $0) }
                }
            }
        }
    }

    private func retentionSection(_ report: RetentionReport) -> some View {
        card("Retention (all time)") {
            ZoomVStack(spacing: 8) {
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
        }
    }

    private var milestonesSection: some View {
        card("Milestones") {
            if model.milestones.isEmpty {
                ContentUnavailableView(
                    "No milestones yet",
                    systemImage: "trophy",
                    description: Text("Master every topic in a course to earn one.")
                )
            } else {
                ZoomVStack(alignment: .leading, spacing: 12) {
                    ForEach(model.milestones) { MilestoneRow(milestone: $0) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            Text(title)
                .zoomFont(.headline)

            content()
        }
        .zoomPadding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }
}
