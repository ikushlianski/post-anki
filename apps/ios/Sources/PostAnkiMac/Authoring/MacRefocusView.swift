import PostAnkiAPI
import SwiftUI

struct MacRefocusView: View {
    @State private var model = CourseRefocusModel()
    @State private var history = MacHistoryCenter.shared.stack(for: "course-refocus", of: Curriculum.self)
    @State private var openRequest = 0
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            stackContent
        }
    }

    private var stackContent: some View {
        content
            .navigationTitle("Refocus suggestions")
            .navigationDestination(for: Curriculum.self) { curriculum in
                MacCourseDetailView(curriculum: curriculum) {}
            }
            .toolbar {
                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .task { await model.load() }
            .onDisappear { openRequest += 1 }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await model.load() } }
            }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, model.errorMessage != nil {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: model.errorMessage) {
                Task { await model.load() }
            }
        } else if !model.hasLoaded {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.items.isEmpty {
            MacEmptyStateView(
                title: "Nothing to refocus",
                systemImage: "scope",
                message: "When a course needs attention, a suggestion shows up here."
            )
        } else {
            list
        }
    }

    private var list: some View {
        List {
            if let message = model.errorMessage {
                Text(message).zoomFont(.caption).foregroundStyle(.red)
            }

            if let notice = model.notice {
                Text(notice).foregroundStyle(.secondary)
            }

            ForEach(model.items) { item in
                ZoomVStack(alignment: .leading, spacing: 6) {
                    Text("\(item.courseName) in \(item.subjectName)").zoomFont(.headline)
                    Text(item.reasonText).zoomFont(.caption).foregroundStyle(.secondary)

                    HStack {
                        Button("Open course") { open(item) }
                            .buttonStyle(.borderedProminent)

                        Button("Dismiss") { Task { await model.dismiss(item) } }
                            .buttonStyle(.bordered)
                    }
                }
                .zoomPadding(.vertical, 4)
                .contextMenu {
                    Button("Open course") { open(item) }
                    Button("Dismiss") { Task { await model.dismiss(item) } }
                }
            }
        }
    }

    private func open(_ item: CourseRefocusSuggestion) {
        openRequest += 1
        let request = openRequest

        Task {
            guard let curriculum = await model.course(for: item),
                  request == openRequest,
                  !Task.isCancelled else { return }

            history.open(curriculum)
        }
    }
}
