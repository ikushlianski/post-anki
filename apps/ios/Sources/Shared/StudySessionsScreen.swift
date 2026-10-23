import PostAnkiAPI
import SwiftUI

struct StudySessionsScreen: View {
    @State private var model = StudySessionsModel()
    @State private var showsPlan = false
    @State private var startedId: String?

    var body: some View {
        List {
            if let message = model.errorMessage, !model.hasLoaded {
                ContentUnavailableView {
                    Label("Couldn't load sessions", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else if !model.hasLoaded {
                ProgressView()
            } else {
                consistencyCard
                group("Upcoming", model.upcoming)
                group("In progress", model.inProgress)
                group("Missed", model.missed)
                group("Done", model.done)

                if model.sessions.isEmpty {
                    Text("No study sessions yet. Tap + to plan one.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Study sessions")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showsPlan = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Plan a session")
                .help("Plan a session")
            }
        }
        .navigationDestination(item: $startedId) { StudySessionRunScreen(sessionId: $0) }
        .sheet(isPresented: $showsPlan) {
            PlanStudySessionSheet(courses: model.courseNames.sorted { $0.value < $1.value }) { created, startNow in
                Task { await model.load() }

                if startNow { startedId = created.id }
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private var consistencyCard: some View {
        if let consistency = model.consistency {
            Section {
                if consistency.planned == 0 {
                    Text("No sessions planned in the last 30 days.")
                        .foregroundStyle(.secondary)
                } else {
                    let percent = Int((consistency.rate * 100).rounded())
                    Text("Last 30 days: \(consistency.completed) of \(consistency.planned) sessions done (\(percent)%)")
                }
            }
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ items: [StudySessionListItem]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { item in
                    NavigationLink {
                        StudySessionRunScreen(sessionId: item.id)
                    } label: {
                        StudySessionRow(item: item, label: model.targetLabel(type: item.targetType, id: item.targetId))
                    }
                }
            }
        }
    }
}

struct StudySessionRow: View {
    let item: StudySessionListItem
    let label: String

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            Text(label).zoomFont(.headline)

            ZoomHStack(spacing: 6) {
                Text("\(item.plannedDurationMinutes) min")

                if let scheduled = item.scheduledFor, let text = DueReviewModel.nextDueText(scheduled) {
                    Text(text)
                }

                if item.status == "completed" || item.status == "abandoned" {
                    Text("\(item.questionsAnswered) answered, \(item.questionsCorrect) correct")
                }
            }
            .zoomFont(.caption)
            .foregroundStyle(.secondary)
        }
    }
}
