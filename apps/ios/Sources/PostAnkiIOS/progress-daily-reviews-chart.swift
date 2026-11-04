import Charts
import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class DailyReviewsModel {
    var state: InsightState<LearningStats> = .loading

    func load() async {
        do {
            state = .ready(try await APIClient.learningStats())
        } catch {
            if KnowledgeManageError.isCancellation(error) { return }

            state = .failed(ConnectionFailureMessage.message(for: error, fallback: "Couldn't load review activity."))
        }
    }
}

struct DailyReviewsSection: View {
    let model: DailyReviewsModel

    var body: some View {
        Section("Reviews, last 30 days") {
            switch model.state {
            case .loading:
                ProgressView().accessibilityLabel("Loading")
            case .failed(let message):
                VStack(alignment: .leading, spacing: 6) {
                    Text(message).font(.caption).foregroundStyle(.secondary)
                    Button("Try again") { Task { await model.load() } }
                }
            case .ready(let stats) where stats.isEmpty:
                Text(LearningStats.emptyText).foregroundStyle(.secondary)
            case .ready(let stats):
                chart(stats)
            }
        }
    }

    private func chart(_ stats: LearningStats) -> some View {
        Chart(stats.daily) { day in
            if let date = day.day {
                BarMark(x: .value("Day", date, unit: .day), y: .value("Reviews", day.reviews))
            }
        }
        .frame(height: 160)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stats.accessibilitySummary)
        .accessibilityIdentifier("progress-daily-reviews-chart")
    }
}
