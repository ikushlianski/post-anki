import PostAnkiAPI
import SwiftUI

struct LectureScreen: View {
    let topic: Topic
    @State private var model: LectureModel
    @State private var materials: StudyMaterialsModel

    init(topic: Topic) {
        self.topic = topic
        _model = State(initialValue: LectureModel(topicId: topic.id))
        _materials = State(initialValue: StudyMaterialsModel(topicId: topic.id))
    }

    var body: some View {
        List {
            if let message = model.errorMessage, !model.hasLoaded {
                ContentUnavailableView {
                    Label("Couldn't load the lecture", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else if !model.hasLoaded {
                ProgressView()
            } else {
                lectureContent
                StudyMaterialsSection(model: materials)
            }
        }
        .readableWidth()
        .navigationTitle("Lecture")
        .inlineNavigationTitle()
        .toolbar {
            if model.lecture?.status == "ready" {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Recompile") { Task { await model.compile() } }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("More")
                    .help("More")
                    .disabled(model.isGenerating)
                }
            }
        }
        .refreshable {
            async let lecture: Void = model.load()
            async let examples: Void = materials.load()
            await lecture
            await examples
        }
        .task {
            async let lecture: Void = model.load()
            async let examples: Void = materials.load()
            await lecture
            await examples
        }
    }

    @ViewBuilder
    private var lectureContent: some View {
        if model.isGenerating {
            Section {
                HStack {
                    ProgressView()
                    Text("Compiling lecture...")
                }
            }
        } else if let lecture = model.lecture, lecture.status == "ready" {
            readerSections(lecture)
        } else {
            missingSection
            LectureSourcesSection(model: model)
        }

        if model.timedOut {
            Text("Still working. Pull to refresh later.").foregroundStyle(.secondary)
        }

        if let message = model.errorMessage {
            Text(message).foregroundStyle(.red)
        }
    }

    private var missingSection: some View {
        Section {
            if model.lecture?.status == "failed" {
                Text("Compiling failed.")
                Button("Retry compile") { Task { await model.compile() } }
            } else {
                Text("No lecture for this topic yet.").foregroundStyle(.secondary)
                Button("Compile lecture") { Task { await model.compile() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    @ViewBuilder
    private func readerSections(_ lecture: Lecture) -> some View {
        Section {
            Text(lecture.title).font(.title3.bold())
        }

        ForEach(lecture.sections.sorted { $0.order < $1.order }) { section in
            Section(section.heading) {
                Text(LectureMarkdown.text(section.body)).textSelection(.enabled)
            }
        }

        if !lecture.citations.isEmpty {
            Section("Sources") {
                ForEach(lecture.citations) { citation in
                    if let url = WebLink.url(from: citation.url) {
                        Link(citation.title, destination: url)
                    } else {
                        Text(citation.title)
                    }
                }
            }
        }
    }
}

private extension View {
    @ViewBuilder
    func readableWidth() -> some View {
        #if os(macOS)
        frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        #else
        self
        #endif
    }
}
