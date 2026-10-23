import PostAnkiAPI
import SwiftUI

struct DomainMapScreen: View {
    @State private var model = DomainMapModel()

    var body: some View {
        List {
            if !model.subjects.isEmpty {
                Section {
                    Picker("Subject", selection: Binding(
                        get: { model.subjectId },
                        set: { id in Task { await model.select(id) } }
                    )) {
                        ForEach(model.subjects) { subject in
                            Text(subject.name).tag(Optional(subject.id))
                        }
                    }
                }
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await model.load() } }
                }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.tree.isEmpty {
                Text("No map for this subject yet.").foregroundStyle(.secondary)
            }

            Section {
                OutlineGroup(model.tree, children: \.outline) { node in
                    NavigationLink {
                        DomainNodeScreen(node: node, siblings: model.flat) {
                            Task { await model.load() }
                        }
                    } label: {
                        DomainNodeRow(node: node)
                    }
                }
            }
        }
        .navigationTitle("Knowledge maps")
        .toolbar {
            if let subjectId = model.subjectId, !model.tree.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Actions", systemImage: "ellipsis.circle") {
                        NavigationLink("Priority suggestions") {
                            DomainPriorityScreen(subjectId: subjectId, names: model.nodeNames)
                        }

                        NavigationLink("Document scan suggestions") {
                            DocScanScreen(subjectId: subjectId, names: model.nodeNames)
                        }

                        NavigationLink("What to learn next") {
                            DomainRecommendationScreen(subjectId: subjectId, names: model.nodeNames)
                        }
                    }
                }
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}

struct DomainNodeRow: View {
    let node: DomainNodeItem

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(node.name)

                Spacer()

                Text("\(node.percent)%")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(DomainDepth.label(node.targetDepth))
                .zoomFont(.caption2)
                .zoomPadding(.horizontal, 6)
                .zoomPadding(.vertical, 2)
                .background(.quaternary, in: Capsule())

            if let reason = node.supersededReason {
                Text(reason).zoomFont(.caption).foregroundStyle(.secondary)
            }
        }
        .opacity(node.isSuperseded ? 0.5 : 1)
    }
}
