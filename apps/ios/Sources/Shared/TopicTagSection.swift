import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class TopicTagModel {
    let topicId: String
    var allTags: [Tag] = []
    var added: [Tag] = []
    var message: String?
    var isWorking = false

    init(topicId: String) {
        self.topicId = topicId
    }

    func loadTags() async {
        message = nil

        do {
            allTags = try await APIClient.listTags()
        } catch {
            message = TagError.message(for: error)
        }
    }

    func add(_ tag: Tag) async -> Bool {
        await assign(tag)
    }

    func create(name: String) async -> Bool {
        guard !isWorking else { return false }

        isWorking = true
        defer { isWorking = false }

        do {
            let tag = try await APIClient.createTag(name: name)

            if !allTags.contains(tag) { allTags.append(tag) }

            return await assign(tag)
        } catch {
            message = TagError.message(for: error)

            return false
        }
    }

    private func assign(_ tag: Tag) async -> Bool {
        message = nil

        do {
            try await APIClient.assignTag(tagId: tag.id, topicId: topicId)

            if !added.contains(tag) { added.append(tag) }

            return true
        } catch {
            message = TagError.message(for: error)

            if TagError.isMissing(error) {
                let failure = message

                await loadTags()
                message = failure
            }

            return false
        }
    }
}

struct TopicTagSection: View {
    @State private var model: TopicTagModel
    @State private var showsPicker = false

    init(topic: Topic) {
        _model = State(initialValue: TopicTagModel(topicId: topic.id))
    }

    var body: some View {
        Section("Tags") {
            if !model.added.isEmpty {
                Text(model.added.map(\.name).joined(separator: ", "))
            }

            if let message = model.message {
                Text(message).foregroundStyle(.red)
            }

            Button("Add tag") { showsPicker = true }
        }
        .sheet(isPresented: $showsPicker) {
            TopicTagPickerSheet(model: model)
                .macSheetMinSize()
        }
    }
}

struct TopicTagPickerSheet: View {
    let model: TopicTagModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var matches: [Tag] {
        let sorted = model.allTags.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        return trimmed.isEmpty ? sorted : sorted.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let message = model.message {
                    Text(message).zoomFont(.caption).foregroundStyle(.red)
                }

                if !trimmed.isEmpty && !model.allTags.contains(where: { $0.name.caseInsensitiveCompare(trimmed) == .orderedSame }) {
                    Button("Create '\(trimmed)'") {
                        Task { if await model.create(name: trimmed) { dismiss() } }
                    }
                }

                ForEach(matches) { tag in
                    Button(tag.name) {
                        Task { if await model.add(tag) { dismiss() } }
                    }
                    .foregroundStyle(.primary)
                }
            }
            .disabled(model.isWorking)
            .searchable(text: $query)
            .navigationTitle("Add tag")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await model.loadTags() }
        }
    }
}
