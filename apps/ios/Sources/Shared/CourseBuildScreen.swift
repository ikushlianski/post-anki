import PostAnkiAPI
import SwiftUI

struct CourseBuildScreen: View {
    let title: String
    @State private var model: CourseBuildModel

    init(courseId: String, title: String) {
        self.title = title
        _model = State(initialValue: CourseBuildModel(courseId: courseId))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)

                if !model.hasLoaded {
                    Button("Try again") { Task { await model.reload() } }
                }
            }

            if model.isLoading && !model.hasLoaded {
                ProgressView()
            }

            if model.stalled {
                Text(Self.stalledText).foregroundStyle(.secondary)
            }

            if let detail = model.detail {
                content(detail)
            }
        }
        .navigationTitle(title)
        .inlineNavigationTitle()
        .disabled(model.isWorking)
        .refreshable { await model.reload() }
        .task {
            await model.load()
            model.kickPolling()
        }
        .onDisappear { model.stopPolling() }
        #if os(macOS)
        .toolbar {
            ToolbarItem {
                Button { Task { await model.reload() } } label: {
                    Label("Reload", systemImage: "arrow.clockwise")
                }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(model.isLoading)
            }
        }
        #endif
    }

    private static var stalledText: String {
        #if os(macOS)
        "Still working. Press Cmd-R to refresh."
        #else
        "Still working. Pull to refresh."
        #endif
    }

    @ViewBuilder
    private func content(_ detail: CourseBuildDetail) -> some View {
        switch detail.curriculum.status {
        case "draft", "curating":
            Section {
                ZoomHStack(spacing: 12) {
                    ProgressView()
                    Text("Gathering sources...")
                }
            }
        case "awaiting_source_approval":
            CourseBuildSourcesSection(model: model, sources: detail.sources)
        case "shaping_structure":
            CourseBuildStructureSection(model: model)
        case "ready":
            CourseBuildTopicPickSection(model: model, modules: detail.modules, course: detail.curriculum)
        case "failed":
            Section {
                Text("Building this course failed.").foregroundStyle(.red)
                Button("Try again") { Task { await model.retry() } }
            }
        default:
            Section {
                NavigationLink("Open course") {
                    CurriculumDetailScreen(curriculum: detail.curriculum.asCurriculum)
                }
            }
        }
    }
}

extension CourseBuildCourse {
    var asCurriculum: Curriculum {
        Curriculum(id: id, subjectId: subjectId, name: name, description: nil, status: status)
    }
}
