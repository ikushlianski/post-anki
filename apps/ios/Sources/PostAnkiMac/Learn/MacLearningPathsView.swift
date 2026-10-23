import PostAnkiAPI
import SwiftUI

struct MacLearningPathsView: View {
    @State private var model = LearningPathsModel()
    @State private var showsTemplates = false
    @State private var history = MacHistoryCenter.shared.stack(for: "learning-paths", of: String.self)

    var body: some View {
        NavigationStack(path: history.pathBinding) {
            stackContent
        }
    }

    private var stackContent: some View {
        content
            .navigationTitle("Learning paths")
            .navigationDestination(for: String.self) { LearningPathDetailScreen(pathId: $0) }
            .toolbar {
                ToolbarItem {
                    Button { showsTemplates = true } label: {
                        Label("Start a path", systemImage: "plus")
                    }
                }

                ToolbarItem {
                    Button { Task { await model.load() } } label: {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(model.isLoading)
                }
            }
            .sheet(isPresented: $showsTemplates) {
                RoleTemplatesSheet(model: model)
                    .macSheetMinSize(width: 460, height: 380)
            }
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.hasLoaded, model.errorMessage != nil {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: model.errorMessage) {
                Task { await model.load() }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else if model.paths.isEmpty {
            ContentUnavailableView {
                Label("No learning paths yet", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
            } description: {
                Text("Pick a role template to start your first path.")
            } actions: {
                Button("Start a path") { showsTemplates = true }
            }
        } else {
            List {
                group("Active", model.activePaths)
                group("Other", model.otherPaths)
            }
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ paths: [LearningPath]) -> some View {
        if !paths.isEmpty {
            Section(title) {
                ForEach(paths) { path in
                    NavigationLink(value: path.id) {
                        ZoomVStack(alignment: .leading, spacing: 2) {
                            Text(path.name).zoomFont(.headline)

                            Text("\(path.targetRoleLabel) - \(LearningPathError.statusLabel(path.status))")
                                .zoomFont(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}
