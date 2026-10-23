import PostAnkiAPI
import SwiftUI

struct LearningPathsScreen: View {
    @State private var model = LearningPathsModel()
    @State private var showsTemplates = false

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await model.load() } }
                }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.paths.isEmpty {
                Text("No learning paths yet.").foregroundStyle(.secondary)
            }

            group("Active", model.activePaths)
            group("Other", model.otherPaths)
        }
        .navigationTitle("Learning paths")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showsTemplates = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Start a path")
                .help("Start a path")
            }
        }
        .sheet(isPresented: $showsTemplates) {
            RoleTemplatesSheet(model: model)
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    @ViewBuilder
    private func group(_ title: String, _ paths: [LearningPath]) -> some View {
        if !paths.isEmpty {
            Section(title) {
                ForEach(paths) { path in
                    NavigationLink {
                        LearningPathDetailScreen(pathId: path.id)
                    } label: {
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

struct RoleTemplatesSheet: View {
    let model: LearningPathsModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let message = model.startMessage {
                    Text(message).foregroundStyle(.red)
                }

                ForEach(model.templates) { template in
                    HStack {
                        ZoomVStack(alignment: .leading, spacing: 2) {
                            Text(template.name).zoomFont(.headline)

                            Text("\(template.targetRoleLabel) - \(template.targets.count) targets")
                                .zoomFont(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Button("Start") {
                            Task { if await model.start(template) { dismiss() } }
                        }
                        .buttonStyle(.bordered)
                        .disabled(model.isStarting)
                    }
                }
            }
            .navigationTitle("Start a path")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await model.loadTemplates() }
        }
    }
}
