import PostAnkiAPI
import SwiftUI

struct StudyPlanStatsSection: View {
    let forecast: StudyForecast?
    let message: String?

    var body: some View {
        Section("Forecast") {
            if let forecast {
                rows(StudyPlanSummary(forecast))
            } else if let message {
                Text(message).foregroundStyle(.secondary).accessibilityIdentifier("study-plan-forecast-error")
            } else {
                ProgressView().accessibilityIdentifier("study-plan-forecast-loading")
            }
        }
    }

    @ViewBuilder
    private func rows(_ summary: StudyPlanSummary) -> some View {
        if !summary.forecast.hasCards {
            Text("No cards in this subject yet, so there is nothing to forecast.")
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("study-plan-no-cards")
        }

        if let days = summary.daysLeftText {
            Text(days).accessibilityIdentifier("study-plan-days-left")
        }

        Text(summary.dueTodayText).accessibilityIdentifier("study-plan-due-today")
        Text(summary.averageText).accessibilityIdentifier("study-plan-average")

        if let peak = summary.peakText {
            Text(peak).accessibilityIdentifier("study-plan-peak")
        }

        Text(summary.newRemainingText).accessibilityIdentifier("study-plan-new-remaining")
        Text("New cards today: \(summary.newPerDayText)").accessibilityIdentifier("study-plan-new-pace")

        if let paused = summary.pausedText {
            Text(paused).foregroundStyle(.orange).accessibilityIdentifier("study-plan-paused")
        }

        if let finish = summary.finishText {
            Text(finish)
                .foregroundStyle(summary.finishesLate ? .red : .primary)
                .accessibilityIdentifier("study-plan-finish")
        }

        Text(summary.retentionText).accessibilityIdentifier("study-plan-retention-recent")

        if !summary.bars.isEmpty {
            StudyPlanBars(summary: summary)
        }
    }
}

struct StudyPlanBars: View {
    let summary: StudyPlanSummary

    var body: some View {
        let peak = max(summary.bars.map { $0.reviews + $0.newCards }.max() ?? 1, 1)

        VStack(alignment: .leading, spacing: 6) {
            Text("Next \(CountLabel.text(summary.bars.count, "day"))").font(.caption).foregroundStyle(.secondary)

            HStack(alignment: .bottom, spacing: 4) {
                ForEach(summary.bars) { day in
                    VStack(spacing: 0) {
                        Rectangle().fill(Color.orange)
                            .frame(height: 80 * CGFloat(day.newCards) / CGFloat(peak))
                        Rectangle().fill(Color.accentColor)
                            .frame(height: 80 * CGFloat(day.reviews) / CGFloat(peak))
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement()
                    .accessibilityLabel(summary.barLabel(day))
                }
            }
            .frame(height: 80, alignment: .bottom)

            HStack(spacing: 12) {
                Label("Reviews", systemImage: "square.fill").foregroundStyle(Color.accentColor)
                Label("New cards", systemImage: "square.fill").foregroundStyle(.orange)
            }
            .font(.caption2)
        }
        .padding(.vertical, 4)
        .accessibilityIdentifier("study-plan-bars")
    }
}
