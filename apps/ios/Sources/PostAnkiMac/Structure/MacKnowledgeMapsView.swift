import PostAnkiAPI
import SwiftUI

enum MacMapTool: String, Hashable, Identifiable {
    case priority
    case docScan
    case recommendations

    var id: String { rawValue }
}

enum MacMapRoute: Hashable {
    case node(DomainNodeItem)
    case tool(MacMapTool)
}

struct MacKnowledgeMapsView: View {
    @State private var model = DomainMapModel()
    @State private var selection: String?
    @State private var history = MacHistoryCenter.shared.stack(for: "knowledge-maps", of: MacMapRoute.self)

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            stackContent
        }
    }

    private var stackContent: some View {
        content
            .navigationTitle("Knowledge maps")
            .navigationDestination(for: MacMapRoute.self) { route in
                switch route {
                case .node(let node):
                    DomainNodeScreen(node: node, siblings: model.flat) { Task { await model.load() } }
                        .id(node.id)
                case .tool(let tool):
                    if let subjectId = model.subjectId {
                        switch tool {
                        case .priority: DomainPriorityScreen(subjectId: subjectId, names: model.nodeNames)
                        case .docScan: DocScanScreen(subjectId: subjectId, names: model.nodeNames)
                        case .recommendations: DomainRecommendationScreen(subjectId: subjectId, names: model.nodeNames)
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItem {
                    Picker("Subject", selection: Binding(
                        get: { model.subjectId },
                        set: { id in Task { await model.select(id) } }
                    )) {
                        ForEach(model.subjects) { subject in
                            Text(subject.name).tag(Optional(subject.id))
                        }
                    }
                    .disabled(model.subjects.isEmpty)
                }

                ToolbarItem {
                    Button { history.open(.tool(.priority)) } label: { Label("Priority suggestions", systemImage: "flag") }
                        .disabled(!hasMap)
                }

                ToolbarItem {
                    Button { history.open(.tool(.docScan)) } label: { Label("Document scan", systemImage: "doc.text.magnifyingglass") }
                        .disabled(!hasMap)
                }

                ToolbarItem {
                    Button { history.open(.tool(.recommendations)) } label: { Label("What to learn next", systemImage: "lightbulb") }
                        .disabled(!hasMap)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .task { await model.load() }
    }

    private var hasMap: Bool { model.subjectId != nil && !model.tree.isEmpty }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded {
            if let message = model.errorMessage {
                MacLoadStateView(failure: model.failureKind ?? .other, detail: message) { Task { await model.load() } }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else if model.tree.isEmpty, let message = model.errorMessage {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) { Task { await model.load() } }
        } else if model.subjects.isEmpty || model.tree.isEmpty {
            MacEmptyStateView(
                title: model.subjects.isEmpty ? "No subjects yet" : "No map for this subject yet",
                systemImage: "map",
                message: model.subjects.isEmpty
                    ? "Add a subject first, then its knowledge map shows up here."
                    : "Pick another subject from the toolbar."
            )
        } else {
            List(model.tree, children: \.outline, selection: $selection) { node in
                DomainNodeRow(node: node)
            }
            .contextMenu(forSelectionType: String.self) { ids in
                if ids.count == 1, let node = model.flat.first(where: { ids.contains($0.id) }) {
                    Button("Open") { history.open(.node(node)) }
                }
            } primaryAction: { ids in
                if ids.count == 1, let node = model.flat.first(where: { ids.contains($0.id) }) {
                    history.open(.node(node))
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { MacLibraryErrorBanner(message: model.errorMessage) }
        }
    }
}
