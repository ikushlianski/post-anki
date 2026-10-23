import PostAnkiAPI
import SwiftUI

struct GlobalSearchScreen: View {
    @State private var model = GlobalSearchModel()
    @FocusState private var searchFocused: Bool

    var body: some View {
        List {
            #if os(macOS)
            TextField("Search courses, topics and subjects", text: $model.query)
                .textFieldStyle(.roundedBorder)
                .focused($searchFocused)
            #endif

            Picker("Search in", selection: $model.scope) {
                ForEach(GlobalSearchScope.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            if let message = model.openMessage {
                Text(message).foregroundStyle(.red)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.runSearch() } }
            }

            if model.trimmedQuery.isEmpty {
                Text("Type to search").foregroundStyle(.secondary)
            } else if model.isLoading && !model.hasSearched {
                ProgressView()
            } else if model.hasSearched && !model.hasResults {
                Text("No matches for '\(model.trimmedQuery)'").foregroundStyle(.secondary)
            } else {
                results
            }
        }
        .navigationTitle("Search")
        .inlineNavigationTitle()
        .iosSearchable(text: $model.query)
        #if os(macOS)
        .task { searchFocused = true }
        .toolbar {
            ToolbarItem {
                Button { searchFocused = true } label: {
                    Label("Find", systemImage: "magnifyingglass")
                }
                .keyboardShortcut("f", modifiers: .command)
                .help("Focus the search field (Cmd-F)")
            }

            ToolbarItem {
                Button { Task { await model.runSearch() } } label: {
                    Label("Reload", systemImage: "arrow.clockwise")
                }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(model.trimmedQuery.isEmpty || model.isLoading)
            }
        }
        #endif
        .navigationDestination(item: $model.openedTopic) { TopicStudyScreen(topic: $0) }
        .navigationDestination(item: $model.openedCurriculum) { CurriculumDetailScreen(curriculum: $0) }
        .navigationDestination(item: $model.openedSubject) { GlobalSearchSubjectScreen(subject: $0, model: model) }
        .onChange(of: model.query) { model.scheduleSearch() }
        .onChange(of: model.scope) {
            if !model.trimmedQuery.isEmpty { model.scheduleSearch() }
        }
    }

    @ViewBuilder
    private var results: some View {
        switch model.scope {
        case .everything:
            if let everything = model.everything {
                everythingSections(everything)
            }
        case .ranked:
            if let ranked = model.ranked {
                rankedRows(ranked)
            }
        }
    }

    @ViewBuilder
    private func everythingSections(_ response: GlobalSearchResponse) -> some View {
        if !response.subjects.isEmpty {
            Section("Subjects") {
                ForEach(response.subjects) { subject in
                    Button { model.openedSubject = subject } label: { Text(subject.label) }
                        .foregroundStyle(.primary)
                }
            }
        }

        if !response.curricula.isEmpty {
            Section("Courses") {
                ForEach(response.curricula) { course in
                    Button { Task { await model.openCurriculum(id: course.id) } } label: { Text(course.label) }
                        .foregroundStyle(.primary)
                }
            }
        }

        if !response.topics.isEmpty {
            Section("Topics") {
                ForEach(response.topics) { topic in
                    Button {
                        Task { await model.openTopic(id: topic.id, curriculumId: topic.curriculumId) }
                    } label: { Text(topic.label) }
                        .foregroundStyle(.primary)
                }
            }
        }
    }

    @ViewBuilder
    private func rankedRows(_ rows: [GlobalSearchRankedResult]) -> some View {
        ForEach(rows, id: \.rowId) { row in
            switch row.kind {
            case "topic":
                Button { Task { await model.openTopic(id: row.id, curriculumId: row.curriculumId) } } label: {
                    rankedLabel(row)
                }
                .foregroundStyle(.primary)
            case "module":
                Button {
                    if let curriculumId = row.curriculumId {
                        Task { await model.openCurriculum(id: curriculumId) }
                    }
                } label: { rankedLabel(row) }
                    .foregroundStyle(.primary)
            default:
                rankedLabel(row)
            }
        }
    }

    private func rankedLabel(_ row: GlobalSearchRankedResult) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: row.iconName).foregroundStyle(.secondary)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)

                if let course = row.curriculumName {
                    Text(course).font(.caption).foregroundStyle(.secondary)
                }

                if !row.tags.isEmpty {
                    Text(row.tags.map(\.name).joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.blue)
                }
            }
        }
    }
}

private extension View {
    @ViewBuilder
    func iosSearchable(text: Binding<String>) -> some View {
        #if os(iOS)
        searchable(text: text)
        #else
        self
        #endif
    }
}
