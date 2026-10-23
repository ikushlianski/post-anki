import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class CurriculumStatsModel {
    var stats: CurriculumStats?
    var failure: ProgressLoadError?
    var isLoading = false

    func load(curriculumId: String) async {
        guard !isLoading else { return }

        isLoading = true
        failure = nil
        defer { isLoading = false }

        do {
            stats = try await APIClient.curriculumStats(id: curriculumId)
        } catch {
            failure = ProgressLoadError.from(error)
        }
    }
}

struct CurriculumStatsSection: View {
    let model: CurriculumStatsModel
    let topics: [Topic]

    var body: some View {
        Section("Your progress") {
            if let stats = model.stats {
                loaded(stats)
            } else if let failure = model.failure {
                Text(failure.message)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
    }

    @ViewBuilder
    private func loaded(_ stats: CurriculumStats) -> some View {
        if stats.attemptedTopicCount == 0 {
            Text("Practise a topic to see stats here.")
                .foregroundStyle(.secondary)
        } else {
            Text("\(stats.attemptedTopicCount) topics practised")
        }

        ForEach(stats.weakSpots.prefix(3)) { spot in
            ZoomVStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(spot.topicTitle)

                    Spacer()

                    Text("\(spot.maturity)%")
                        .foregroundStyle(.orange)
                }

                if let gap = spot.openGapLabels.first {
                    Text(gap)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }

        if let next = stats.nextStep, let topic = topics.first(where: { $0.id == next.topicId }) {
            NavigationLink {
                ExerciseScreen(topics: [topic])
            } label: {
                Label("Next: \(topic.title)", systemImage: "arrow.right.circle")
            }
        }

        if stats.weakSpots.count > 3 || !stats.strongPoints.isEmpty || !stats.recommendations.isEmpty {
            NavigationLink("See all stats") {
                CurriculumStatsScreen(model: model)
            }
        }
    }
}

struct CurriculumStatsScreen: View {
    let model: CurriculumStatsModel

    var body: some View {
        List {
            if let stats = model.stats {
                if !stats.weakSpots.isEmpty {
                    Section("Weak spots") {
                        ForEach(stats.weakSpots) { spot in
                            ZoomVStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(spot.topicTitle)

                                    Spacer()

                                    Text("\(spot.maturity)%")
                                        .foregroundStyle(.orange)
                                }

                                ForEach(spot.openGapLabels, id: \.self) { gap in
                                    Text(gap)
                                        .zoomFont(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                if !stats.strongPoints.isEmpty {
                    Section("Strong points") {
                        ForEach(stats.strongPoints) { point in
                            HStack {
                                Text(point.topicTitle)

                                Spacer()

                                Text("\(point.maturity)%")
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                }

                if stats.recommendationsEligible && !stats.recommendations.isEmpty {
                    Section("Recommendations") {
                        ForEach(stats.recommendations) { recommendation in
                            recommendationRow(recommendation, stats: stats)
                        }
                    }
                }
            }
        }
        .navigationTitle("Course stats")
        .refreshable {
            if let id = model.stats?.curriculumId { await model.load(curriculumId: id) }
        }
    }

    private func recommendationRow(_ item: TopicRecommendation, stats: CurriculumStats) -> some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            if let title = stats.weakSpots.first(where: { $0.topicId == item.topicId })?.topicTitle {
                Text(title)
                    .zoomFont(.headline)
            }

            Text(item.text)

            if let when = DueReviewModel.nextDueText(item.generatedAt) {
                Text(when)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
