import PostAnkiAPI
import SwiftUI

struct MacCoursesView: View {
    @State private var model = CoursesScreenModel()
    @State private var authoring: MacCourseAuthoringDestination?
    @State private var history = MacHistoryCenter.shared.stack(for: "courses", of: Curriculum.self)
    private let openRequest = MacCourseOpenRequest.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            content
                .navigationTitle("Courses")
                .navigationDestination(for: Curriculum.self) { curriculum in
                    MacCourseDetailView(curriculum: curriculum) { Task { await model.load() } }
                }
                .navigationDestination(item: $authoring) { destination in
                    MacCourseAuthoringDestinationView(destination: destination) {
                        Task { await model.load() }
                    }
                }
                .toolbar {
                    ToolbarItem {
                        Button { authoring = .newCourse } label: {
                            Label("New course", systemImage: "plus.rectangle.on.folder")
                        }
                    }

                    ToolbarItem {
                        Button { authoring = .builds } label: {
                            Label("Course builds", systemImage: "hammer")
                        }
                    }

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
                .onAppear { openRequested() }
                .onChange(of: openRequest.curriculum) { openRequested() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await model.load() } }
                }
        }
    }

    private func openRequested() {
        if let curriculum = openRequest.take() {
            history.setPath([curriculum])
        }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, let failure = model.failure {
            MacLoadStateView(failure: failure) { Task { await model.load() } }
        } else if !model.hasLoaded {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.subjects.isEmpty {
            MacEmptyStateView(
                title: "No courses yet",
                systemImage: "books.vertical",
                message: "Create a course on your server or in the iOS app and it appears here."
            )
        } else {
            List {
                ForEach(model.subjects) { subject in
                    Section(subject.name) {
                        ForEach(model.curricula(for: subject.id)) { curriculum in
                            NavigationLink(value: curriculum) {
                                Text(curriculum.name)
                            }
                        }
                    }
                }

                if let failure = model.failure {
                    Text(failure.macDetail)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
