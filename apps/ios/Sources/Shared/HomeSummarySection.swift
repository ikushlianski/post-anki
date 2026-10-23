import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class HomeSummaryModel {
    var summary: HomeSummary?
    var streak: Streak?
    var failure: ProgressLoadError?
    var isLoading = false

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        failure = nil
        defer { isLoading = false }

        async let summaryResult = Self.fetchSummary()
        async let streakResult = Self.fetchStreak()
        let (summaryOutcome, streakOutcome) = await (summaryResult, streakResult)

        if case .success(let value) = summaryOutcome { summary = value }

        if case .success(let value) = streakOutcome { streak = value }

        if case .failure(let error) = summaryOutcome {
            failure = ProgressLoadError.from(error)
        } else if case .failure(let error) = streakOutcome {
            failure = ProgressLoadError.from(error)
        }
    }

    private static func fetchSummary() async -> Result<HomeSummary, Error> {
        do { return .success(try await APIClient.homeSummary()) } catch { return .failure(error) }
    }

    private static func fetchStreak() async -> Result<Streak, Error> {
        do { return .success(try await APIClient.streak()) } catch { return .failure(error) }
    }
}

struct HomeSummarySection: View {
    let model: HomeSummaryModel

    var body: some View {
        Section("Today") {
            if model.summary == nil && model.streak == nil {
                if let failure = model.failure {
                    Text(failure.message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            } else {
                streakRow

                if let stats = model.summary?.funStats {
                    HStack {
                        statTile(value: stats.questionsAnswered, label: "answered")
                        statTile(value: stats.topicsMastered, label: "topics mastered")
                    }
                }

                ForEach((model.summary?.topSubjects ?? []).prefix(3)) { subject in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(subject.subjectName)
                            .font(.subheadline)

                        Text("\(subject.topicsTouchedLast30Days) topics this month")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var currentStreak: Int {
        model.streak?.currentStreak ?? model.summary?.funStats.currentStreak ?? 0
    }

    private var longestStreak: Int {
        model.streak?.longestStreak ?? model.summary?.funStats.longestStreak ?? 0
    }

    private var streakRow: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(
                currentStreak > 0 ? "\(currentStreak)-day streak (best \(longestStreak))" : "Start a streak today",
                systemImage: "flame.fill"
            )
            .font(.headline)
            .foregroundStyle(.orange)

            if currentStreak > 0, model.streak?.isActiveToday == false {
                Text("Study today to keep it going")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func statTile(value: Int, label: String) -> some View {
        VStack {
            Text("\(value)")
                .font(.title3.bold())

            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
