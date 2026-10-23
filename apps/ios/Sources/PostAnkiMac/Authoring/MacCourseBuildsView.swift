import PostAnkiAPI
import SwiftUI

enum MacCourseBuildsRoute: Hashable {
    case course(CourseBuildCourse)
    case create
}

struct MacCourseBuildsRouteView: View {
    let route: MacCourseBuildsRoute

    var body: some View {
        switch route {
        case .course(let course): CourseBuildScreen(courseId: course.id, title: course.name)
        case .create: CourseBuildCreateScreen()
        }
    }
}

struct MacCourseBuildsEntryView: View {
    @State private var history = MacHistoryCenter.shared.stack(for: "course-builds", of: MacCourseBuildsRoute.self)

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            MacCourseBuildsView(history: history)
                .navigationDestination(for: MacCourseBuildsRoute.self) { MacCourseBuildsRouteView(route: $0) }
        }
    }
}

struct MacCourseBuildsView: View {
    var history: MacStackHistory<MacCourseBuildsRoute>?

    @State private var model = CourseBuildListModel()
    @State private var selection: CourseBuildCourse.ID?
    @State private var localRoute: MacCourseBuildsRoute?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        content
            .navigationTitle("Course builds")
            .navigationDestination(item: $localRoute) { MacCourseBuildsRouteView(route: $0) }
            .toolbar {
                ToolbarItem {
                    Button { open(.create) } label: {
                        Label("New course", systemImage: "plus.rectangle.on.folder")
                    }
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .task { await model.load() }
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
        } else if model.courses.isEmpty {
            ContentUnavailableView {
                Label("No courses are being built", systemImage: "hammer")
            } description: {
                Text("Start a new course and it shows its build status here.")
            } actions: {
                Button("New course") { open(.create) }
            }
        } else {
            table
        }
    }

    private var table: some View {
        VStack(spacing: 0) {
            MacLibraryErrorBanner(message: model.errorMessage)

            Table(model.courses, selection: $selection) {
                TableColumn("Course", value: \.name)
                TableColumn("Status") { Text($0.statusLabel) }
            }
            .contextMenu(forSelectionType: CourseBuildCourse.ID.self) { ids in
                if let course = course(in: ids) {
                    Button("Open") { open(.course(course)) }
                }
            } primaryAction: { ids in
                if let course = course(in: ids) { open(.course(course)) }
            }
        }
    }

    private func open(_ route: MacCourseBuildsRoute) {
        if let history { history.open(route) } else { localRoute = route }
    }

    private func course(in ids: Set<CourseBuildCourse.ID>) -> CourseBuildCourse? {
        guard ids.count == 1, let id = ids.first else { return nil }

        return model.courses.first { $0.id == id }
    }
}
