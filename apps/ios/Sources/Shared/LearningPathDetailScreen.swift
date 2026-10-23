import PostAnkiAPI
import SwiftUI

struct LearningPathDetailScreen: View {
    @State private var model: LearningPathDetailModel
    @State private var confirmsAbandon = false

    init(pathId: String) {
        _model = State(initialValue: LearningPathDetailModel(pathId: pathId))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                    Button("Try again") { Task { await model.load() } }
                }
            }

            if let detail = model.detail {
                Section {
                    Text(detail.path.targetRoleLabel).font(.headline)

                    Text(LearningPathError.statusLabel(detail.progress.overallStatus))
                        .foregroundStyle(.secondary)
                }

                Section("Steps") {
                    ForEach(detail.steps.sorted { $0.order < $1.order }) { step in
                        stepRow(step, detail: detail)
                    }
                }

                if detail.path.status != "abandoned" && detail.path.status != "completed" {
                    Section {
                        Button("Abandon path", role: .destructive) { confirmsAbandon = true }
                            .disabled(model.isAbandoning)
                    }
                }
            } else if model.isLoading {
                ProgressView()
            }
        }
        .navigationTitle(model.detail?.path.name ?? "Path")
        .inlineNavigationTitle()
        .confirmationDialog("Abandon this path?", isPresented: $confirmsAbandon, titleVisibility: .visible) {
            Button("Abandon path", role: .destructive) { Task { await model.abandon() } }
            Button("Cancel", role: .cancel) {}
        }
        .refreshable { await model.load() }
        .task { await model.load() }
    }

    private func stepRow(_ step: LearningPathStep, detail: LearningPathDetail) -> some View {
        let status = detail.progress.steps.first { $0.domainNodeId == step.domainNodeId }

        return VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(model.templateNames[step.domainNodeId] ?? "Untitled step").font(.headline)

                if detail.nextStepDomainNodeId == step.domainNodeId {
                    Text("Next")
                        .font(.caption.bold())
                        .padding(.horizontal, 6)
                        .background(.tint.opacity(0.2), in: Capsule())
                }
            }

            if let status {
                Text(LearningPathError.statusLabel(status.status))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text("\(status.progress.topicsMastered) of \(status.progress.topicsIncluded) topics mastered (\(status.progress.percent)%)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
