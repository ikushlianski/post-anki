import PostAnkiAPI
import SwiftUI

struct AdminScreen: View {
    @State private var model = AdminModel()

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            }

            Section {
                NavigationLink("Run scans") { AdminScansScreen() }
            }

            AdminOverviewSections(model: model)
        }
        .navigationTitle("Admin")
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}

struct AdminOverviewSections: View {
    let model: AdminModel

    var body: some View {
        Group {
            if let settings = model.settings {
                Section("Settings") {
                    LabeledContent("AI tier", value: settings.modelTier)
                    LabeledContent("Item model", value: settings.knowledgeItemModelId ?? "Default")
                    LabeledContent("Test toggle", value: settings.testToggle ? "On" : "Off")
                }
            }

            if let observability = model.observability {
                Section("Stuck course builds") {
                    if observability.stuckCurricula.isEmpty {
                        Text("None.").foregroundStyle(.secondary)
                    }

                    ForEach(observability.stuckCurricula) { course in
                        VStack(alignment: .leading) {
                            Text(course.name)
                            Text("\(course.status), \(course.stuckText)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Recent AI calls") {
                    ForEach(observability.recentEvents) { AdminEventRow(event: $0) }
                }

                Section("Recent merges") {
                    if observability.recentMerges.isEmpty {
                        Text("None.").foregroundStyle(.secondary)
                    }

                    ForEach(observability.recentMerges) { merge in
                        VStack(alignment: .leading) {
                            Text("\(merge.entityType): \(merge.sourceName) into \(merge.targetName)")
                            Text(merge.countsText).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Item approval by model") {
                if model.hasLoaded && model.feedback.isEmpty {
                    Text("No feedback yet.").foregroundStyle(.secondary)
                }

                ForEach(model.feedback) { entry in
                    VStack(alignment: .leading) {
                        Text(entry.modelId)
                        Text("\(entry.approved) approved, \(entry.rejected) rejected").font(.caption)

                        if !entry.topReasons.isEmpty {
                            Text(entry.topReasons.map { "\($0.reasonCode) (\($0.count))" }.joined(separator: ", "))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}

struct AdminEventRow: View {
    let event: AdminEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(event.op) (\(event.agentKey))")

            Text(detail).font(.caption).foregroundStyle(.secondary)

            if !event.success {
                Text(event.errorMessage ?? "Failed").font(.caption).foregroundStyle(.red)
            }
        }
    }

    private var detail: String {
        var parts = [String(format: "%.1fs", event.durationMs / 1000)]

        if let course = event.curriculumName { parts.insert(course, at: 0) }
        if let tokens = event.totalTokens { parts.append("\(tokens) tokens") }

        return parts.joined(separator: ", ")
    }
}
