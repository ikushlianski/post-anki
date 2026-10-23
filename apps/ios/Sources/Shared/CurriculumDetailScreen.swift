import PostAnkiAPI
import SwiftUI

struct CurriculumDetailScreen: View {
    let curriculum: Curriculum
    @State private var model = CurriculumDetailScreenModel()
    @State private var statsModel = CurriculumStatsModel()
    #if os(macOS)
    @State private var selection: Set<String> = []
    @State private var destination: TopicDestination?
    #endif

    #if os(iOS)
    var body: some View {
        List {
            CurriculumStatsSection(
                model: statsModel,
                topics: model.detail?.modules.flatMap(\.topics) ?? []
            )
            CourseEditSection(curriculum: curriculum) { Task { await model.load(curriculumId: curriculum.id) } }

            if let modules = model.detail?.modules {
                ForEach(modules) { module in
                    Section(module.title) {
                        NavigationLink("Practice this module") {
                            ExerciseScreen(topics: module.topics)
                        }
                        .disabled(module.topics.isEmpty)

                        ForEach(module.topics) { topic in
                            TopicRow(topic: topic, subjectId: curriculum.subjectId)
                        }
                    }
                }
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
            }
        }
        .navigationTitle(curriculum.name)
        .refreshable {
            async let detail: Void = model.load(curriculumId: curriculum.id)
            async let stats: Void = statsModel.load(curriculumId: curriculum.id)
            await detail
            await stats
        }
        .task {
            LastStudied.record(curriculumId: curriculum.id, curriculumName: curriculum.name)
            async let detail: Void = model.load(curriculumId: curriculum.id)
            async let stats: Void = statsModel.load(curriculumId: curriculum.id)
            await detail
            await stats
        }
    }
    #endif
}

private struct TopicRow: View {
    let topic: Topic
    let subjectId: String

    var body: some View {
        HStack {
            NavigationLink(topic.title) {
                ExerciseScreen(topics: [topic])
            }

            Spacer()

            NavigationLink {
                IngestionDictationScreen(topic: topic, subjectId: subjectId)
            } label: {
                Image(systemName: "mic.fill")
            }
            .buttonStyle(.plain)
            .tint(.accentColor)
            .accessibilityLabel("Dictate knowledge")
            .help("Dictate knowledge")

            NavigationLink {
                TopicStudyScreen(topic: topic)
            } label: {
                Image(systemName: "text.bubble")
            }
            .buttonStyle(.plain)
            .tint(.accentColor)
            .accessibilityLabel("Study tools")
            .help("Study tools")
        }
    }
}

#if os(macOS)
private enum TopicDestination: Hashable {
    case practice([Topic])
    case study(Topic)
    case addKnowledge(Topic)
}

extension CurriculumDetailScreen {
    var body: some View {
        content
            .navigationTitle(curriculum.name)
            .navigationDestination(item: $destination) { destination in
                switch destination {
                case .practice(let topics): ExerciseScreen(topics: topics)
                case .study(let topic): TopicStudyScreen(topic: topic)
                case .addKnowledge(let topic):
                    IngestionDictationScreen(topic: topic, subjectId: curriculum.subjectId)
                }
            }
            .toolbar {
                ToolbarItem {
                    Button {
                        Task { await reload() }
                    } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
                }
            }
            .task {
                LastStudied.record(curriculumId: curriculum.id, curriculumName: curriculum.name)
                await reload()
            }
    }

    private func reload() async {
        async let detail: Void = model.load(curriculumId: curriculum.id)
        async let stats: Void = statsModel.load(curriculumId: curriculum.id)
        await detail
        await stats
    }

    private var topics: [Topic] {
        model.detail?.modules.flatMap(\.topics) ?? []
    }

    @ViewBuilder
    private var content: some View {
        if let modules = model.detail?.modules {
            if modules.isEmpty {
                MacEmptyStateView(
                    title: "No topics yet",
                    systemImage: "list.bullet",
                    message: "This course has no topics. Add some from your server or the iOS app."
                )
            } else {
                topicList(modules)
            }
        } else if let failure = model.failure {
            MacLoadStateView(failure: failure) { Task { await reload() } }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func topicList(_ modules: [Module]) -> some View {
        List(selection: $selection) {
            CurriculumStatsSection(model: statsModel, topics: topics)
            CourseEditSection(curriculum: curriculum) { Task { await reload() } }

            ForEach(modules) { module in
                Section(module.title) {
                    Button("Practice this module") { destination = .practice(module.topics) }
                        .buttonStyle(.link)
                        .disabled(module.topics.isEmpty)

                    ForEach(module.topics) { topic in
                        topicRow(topic).tag(topic.id)
                    }
                }
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            if let topic = selectedTopic(ids) {
                topicActions(topic)
            }
        } primaryAction: { ids in
            if let topic = selectedTopic(ids) {
                destination = .study(topic)
            }
        }
    }

    private func selectedTopic(_ ids: Set<String>) -> Topic? {
        guard ids.count == 1, let id = ids.first else { return nil }

        return topics.first { $0.id == id }
    }

    @ViewBuilder
    private func topicActions(_ topic: Topic) -> some View {
        Button("Practice") { destination = .practice([topic]) }
        Button("Study tools") { destination = .study(topic) }
        Button("Add knowledge") { destination = .addKnowledge(topic) }
    }

    private func topicRow(_ topic: Topic) -> some View {
        HStack {
            Text(topic.title)

            Spacer()

            Button("Practice") { destination = .practice([topic]) }
            Button("Study tools") { destination = .study(topic) }
            Button {
                destination = .addKnowledge(topic)
            } label: {
                Label("Add knowledge", systemImage: "square.and.pencil")
                    .labelStyle(.iconOnly)
            }
            .help("Add knowledge")
        }
        .buttonStyle(.borderless)
    }
}
#endif
