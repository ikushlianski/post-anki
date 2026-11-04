import Charts
import PostAnkiAPI
import SwiftUI

func ownerUsd(_ value: Double) -> String { String(format: "$%.2f", value) }

struct OwnerStatsTiles: View {
    let learning: OwnerLearningStats
    let monthSpendUsd: Double?

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            tile("Streak (current / longest)", "\(learning.currentStreak) / \(learning.longestStreak) days")
            tile("Accuracy, last 7 days", learning.accuracyLast7.map { "\(Int(($0 * 100).rounded()))%" } ?? "–")
            tile("Reviews today", "\(learning.todayReviews)")
            tile("AI spend this month (est.)", monthSpendUsd.map(ownerUsd) ?? "n/a")
        }
    }

    private func tile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

struct OwnerReviewsChart: View {
    let days: [OwnerStatsDay]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Reviews per day").font(.headline)

            if days.allSatisfy({ $0.reviews == 0 }) {
                Text("No reviews in this range").foregroundStyle(.secondary)
            } else {
                Chart(days) { day in
                    BarMark(x: .value("Day", day.date), y: .value("Reviews", day.reviews))
                }
                .chartXAxis(.hidden)
                .frame(height: 160)

                Text("Accuracy per day").font(.headline)

                Chart(days.filter { $0.accuracy != nil }) { day in
                    LineMark(x: .value("Day", day.date), y: .value("Accuracy", (day.accuracy ?? 0) * 100))
                }
                .chartYScale(domain: 0...100)
                .chartXAxis(.hidden)
                .frame(height: 140)
            }
        }
    }
}

struct OwnerSpendChart: View {
    let spend: OwnerAiSpend

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("AI spend per day (estimated)").font(.headline)

            if spend.days.isEmpty || spend.totalUsd == 0 {
                Text("No priced AI spend in this range").foregroundStyle(.secondary)
            } else {
                Chart(spend.days) { day in
                    BarMark(x: .value("Day", day.date), y: .value("USD", day.totalUsd))
                }
                .chartXAxis(.hidden)
                .frame(height: 160)

                Text("Total \(ownerUsd(spend.totalUsd))").font(.caption).foregroundStyle(.secondary)
            }

            if spend.unpricedCalls > 0 {
                Text("\(spend.unpricedCalls) calls (\(spend.unpricedTokens) tokens) have no known price and are not counted.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
