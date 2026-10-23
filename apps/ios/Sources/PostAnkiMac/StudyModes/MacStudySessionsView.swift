import PostAnkiAPI
import SwiftUI

struct MacStudySessionsView: View {
    @State private var model = StudySessionsModel()
    @State private var selection: Set<String> = []
    @State private var showsPlan = false
    @State private var history = MacHistoryCenter.shared.stack(for: "study-sessions", of: String.self)

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            stackContent
        }
    }

    private var stackContent: some View {
        content
            .navigationTitle("Study sessions")
            .toolbar {
                ToolbarItem {
                    Button { showsPlan = true } label: {
                        Label("Plan session", systemImage: "plus")
                    }
                }

                ToolbarItem {
                    Button { Task { await model.load() } } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
                }
            }
            .navigationDestination(for: String.self) { id in
                StudySessionRunScreen(sessionId: id, model: MacStudySessionRunStore.shared.model(for: id))
            }
            .sheet(isPresented: $showsPlan) {
                PlanStudySessionSheet(courses: model.courseNames.sorted { $0.value < $1.value }) { created, startNow in
                    Task { await model.load() }

                    if startNow { history.open(created.id) }
                }
            }
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if let message = model.errorMessage, !model.hasLoaded {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) { Task { await model.load() } }
        } else if !model.hasLoaded {
            ProgressView()
        } else if model.sessions.isEmpty {
            MacEmptyStateView(
                title: "No study sessions yet",
                systemImage: "calendar.badge.clock",
                message: "Use Plan session in the toolbar to schedule one."
            )
        } else {
            VStack(spacing: 0) {
                summary
                table
            }
        }
    }

    @ViewBuilder
    private var summary: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let message = model.errorMessage {
                Text(message).font(.caption).foregroundStyle(.red)
            }

            if let consistency = model.consistency {
                if consistency.planned == 0 {
                    Text("No sessions planned in the last 30 days.")
                } else {
                    let percent = Int((consistency.rate * 100).rounded())
                    Text("Last 30 days: \(consistency.completed) of \(consistency.planned) sessions done (\(percent)%)")
                }
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.vertical, 6)
    }

    private var table: some View {
        Table(model.sessions, selection: $selection) {
            TableColumn("Title") { item in
                Text(model.targetLabel(type: item.targetType, id: item.targetId))
            }

            TableColumn("Planned time") { item in
                Text(plannedText(item))
            }

            TableColumn("Status") { item in
                Text(statusText(item))
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            if let id = ids.first {
                Button("Open") { history.open(id) }
            }
        } primaryAction: { ids in
            if let id = ids.first { history.open(id) }
        }
    }

    private func plannedText(_ item: StudySessionListItem) -> String {
        let length = "\(item.plannedDurationMinutes) min"

        guard let date = StudySessionDates.parse(item.scheduledFor) else { return length }

        return "\(date.formatted(date: .abbreviated, time: .shortened)), \(length)"
    }

    private func statusText(_ item: StudySessionListItem) -> String {
        switch item.status {
        case "planned": item.missed ? "Missed" : "Planned"
        case "in_progress": "In progress"
        case "completed": "Done: \(item.questionsCorrect)/\(item.questionsAnswered) correct"
        case "abandoned": "Abandoned"
        default: item.status
        }
    }
}
