import PostAnkiAPI
import SwiftUI

struct TagsScreen: View {
    @State private var model = TagsModel()
    @State private var mergeSource: Tag?

    var body: some View {
        List {
            if let notice = model.notice {
                Text(notice).foregroundStyle(.green)
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.tags.isEmpty {
                Text("No tags yet.").foregroundStyle(.secondary)
            }

            ForEach(model.filtered) { tag in
                NavigationLink {
                    TagDetailScreen(tag: tag)
                } label: {
                    HStack {
                        Text(tag.name)

                        Spacer()

                        Text(model.mastery[tag.id]?.statusLabel ?? "New")
                            .zoomFont(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .swipeActions {
                    Button("Merge into...") { mergeSource = tag }
                        .tint(.orange)
                }
            }
        }
        .navigationTitle("Tags")
        .searchable(text: $model.query)
        .sheet(item: $mergeSource) { source in
            MergeTagSheet(source: source, candidates: model.tags.filter { $0.id != source.id }) { target in
                await model.merge(source: source, into: target)
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}

struct TagDetailScreen: View {
    @State private var model: TagDetailModel

    init(tag: Tag) {
        _model = State(initialValue: TagDetailModel(tag: tag))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.nodes.isEmpty {
                Text("Nothing is tagged with this yet.").foregroundStyle(.secondary)
            }

            if let message = model.openMessage {
                Text(message).foregroundStyle(.red)
            }

            group("Topics", "topic")
            group("Modules", "module")
            group("Knowledge bits", "bit")

            if model.capped {
                Text("Showing the first results only.").foregroundStyle(.secondary)
            }
        }
        .navigationTitle(model.tag.name)
        .inlineNavigationTitle()
        .navigationDestination(item: $model.openedTopic) { TopicStudyScreen(topic: $0) }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private func group(_ title: String, _ kind: String) -> some View {
        let nodes = model.nodes(of: kind)

        if !nodes.isEmpty {
            Section(title) {
                ForEach(nodes) { node in
                    let row = ZoomVStack(alignment: .leading, spacing: 2) {
                        Text(node.title).lineLimit(2)

                        if let course = node.curriculumName {
                            Text(course).zoomFont(.caption).foregroundStyle(.secondary)
                        }
                    }

                    if kind == "topic" {
                        Button { Task { await model.open(node) } } label: { row }
                            .buttonStyle(.plain)
                    } else {
                        row
                    }
                }
            }
        }
    }
}
