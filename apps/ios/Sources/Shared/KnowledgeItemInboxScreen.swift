import PostAnkiAPI
import SwiftUI

struct ModuleOption: Identifiable, Hashable {
    let id: String
    let title: String
    let curriculumName: String
}

@Observable
@MainActor
final class KnowledgeItemInboxModel {
    var items: [PendingPlacementSuggestion] = []
    var moduleOptions: [ModuleOption] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?
    var notice: String?

    // Sheet-driven detail/edit state for one item at a time.
    var editingItem: PendingPlacementSuggestion?
    var editingTitle = ""
    var editingModuleId: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        failureKind = nil
        defer { isLoading = false }

        do {
            async let suggestionsTask = APIClient.listPlacementSuggestions()
            async let curriculaTask = APIClient.listCurricula()
            items = try await suggestionsTask
            let curricula = try await curriculaTask

            var options: [ModuleOption] = []
            for curriculum in curricula {
                guard let detail = try? await APIClient.getCurriculumDetail(curriculum.id) else { continue }
                options.append(contentsOf: detail.modules.map {
                    ModuleOption(id: $0.id, title: $0.title, curriculumName: curriculum.name)
                })
            }
            moduleOptions = options
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            errorMessage = "Couldn't load the Knowledge Inbox."
            failureKind = ProgressLoadError.from(error) ?? .other
        }
    }

    // A confident match: the AI's free-text suggestion names exactly one
    // known module. Never guess between multiple candidates — swipe-approve
    // only fires blind when there's no ambiguity.
    func confidentMatch(for item: PendingPlacementSuggestion) -> ModuleOption? {
        let suggestion = item.placementSuggestion.lowercased()
        let matches = moduleOptions.filter { suggestion.contains($0.title.lowercased()) }
        return matches.count == 1 ? matches.first : nil
    }


    func approveSelected(_ selected: [PendingPlacementSuggestion]) async {
        notice = nil

        if selected.count == 1, let only = selected.first {
            await swipeApprove(only)

            return
        }

        var unmatched = 0

        for item in selected {
            if let match = confidentMatch(for: item) {
                await approve(item, moduleId: match.id, title: item.placementSuggestion)
            } else {
                unmatched += 1
            }
        }

        if unmatched > 0 {
            notice = "\(unmatched) \(unmatched == 1 ? "item needs" : "items need") a deck. Open \(unmatched == 1 ? "it" : "them") one at a time to approve."
        }
    }

    func swipeApprove(_ item: PendingPlacementSuggestion) async {
        if let match = confidentMatch(for: item) {
            await approve(item, moduleId: match.id, title: item.placementSuggestion)
        } else {
            beginEditing(item)
        }
    }

    func beginEditing(_ item: PendingPlacementSuggestion) {
        editingItem = item
        editingTitle = item.placementSuggestion
        editingModuleId = confidentMatch(for: item)?.id
    }

    func approve(_ item: PendingPlacementSuggestion, moduleId: String, title: String) async {
        do {
            _ = try await APIClient.resolvePlacementSuggestion(
                id: item.id,
                accepted: true,
                moduleId: moduleId,
                title: title
            )
            items.removeAll { $0.id == item.id }
        } catch APIError.badStatus(409, _) {
            // Already resolved elsewhere — not an error the learner needs to see.
            items.removeAll { $0.id == item.id }
        } catch {
            errorMessage = "Couldn't approve that item."
        }

        if editingItem?.id == item.id {
            editingItem = nil
        }
    }

    func reject(_ item: PendingPlacementSuggestion) async {
        do {
            _ = try await APIClient.resolvePlacementSuggestion(id: item.id, accepted: false)
            items.removeAll { $0.id == item.id }
        } catch APIError.badStatus(409, _) {
            items.removeAll { $0.id == item.id }
        } catch {
            errorMessage = "Couldn't reject that item."
        }

        if editingItem?.id == item.id {
            editingItem = nil
        }
    }
}

struct KnowledgeItemInboxScreen: View {
    @State private var model = KnowledgeItemInboxModel()

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.items) { item in
                    ZoomVStack(alignment: .leading, spacing: 4) {
                        Text(item.body)
                            .lineLimit(2)
                        Text(item.placementSuggestion)
                            .zoomFont(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { model.beginEditing(item) }
                    .swipeActions(edge: .trailing) {
                        Button("Approve") {
                            Task { await model.swipeApprove(item) }
                        }
                        .tint(.green)

                        Button("Reject", role: .destructive) {
                            Task { await model.reject(item) }
                        }
                    }
                }

                if model.items.isEmpty && !model.isLoading {
                    Text("Nothing waiting for review.")
                        .foregroundStyle(.secondary)
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
            .navigationTitle("Placement suggestions")
            .refreshable { await model.load() }
            .task { await model.load() }
            .sheet(item: $model.editingItem) { item in
                KnowledgeItemDetailSheet(item: item, model: model)
            }
        }
    }
}

struct KnowledgeItemDetailSheet: View {
    let item: PendingPlacementSuggestion
    let model: KnowledgeItemInboxModel

    var body: some View {
        NavigationStack {
            Form {
                Section("Content") {
                    Text(item.body)
                }

                Section("Title") {
                    TextField("Title", text: Binding(
                        get: { model.editingTitle },
                        set: { model.editingTitle = $0 }
                    ))
                }

                Section("Deck") {
                    Picker("Module", selection: Binding(
                        get: { model.editingModuleId },
                        set: { model.editingModuleId = $0 }
                    )) {
                        Text("Choose a deck").tag(String?.none)
                        ForEach(model.moduleOptions) { option in
                            Text("\(option.curriculumName) — \(option.title)").tag(String?.some(option.id))
                        }
                    }
                }

                Section {
                    Button("Approve") {
                        guard let moduleId = model.editingModuleId else { return }
                        Task { await model.approve(item, moduleId: moduleId, title: model.editingTitle) }
                    }
                    .disabled(model.editingModuleId == nil || model.editingTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button("Reject", role: .destructive) {
                        Task { await model.reject(item) }
                    }
                }
            }
            .navigationTitle("Review item")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { model.editingItem = nil }
                }
            }
        }
    }
}
