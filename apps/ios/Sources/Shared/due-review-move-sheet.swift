import PostAnkiAPI
import SwiftUI

struct DueReviewMoveSheet: View {
    let model: DueReviewModel

    @State private var choices: [(id: String, label: String)] = []
    @State private var recentIds: [String] = []
    @State private var query = ""
    @State private var loadFailed = false

    private var recents: [(id: String, label: String)] {
        RecentMoveTargets.ordered(recent: recentIds, choices: available)
    }

    private var available: [(id: String, label: String)] {
        choices
    }

    private var matches: [(id: String, label: String)] {
        RecentMoveTargets.filtered(available, query: query)
    }

    var body: some View {
        NavigationStack {
            List {
                if let message = model.moveError ?? (loadFailed ? "Couldn't load decks." : nil) {
                    Text(message)
                        .zoomFont(.caption)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("review-move-error")
                }

                if query.isEmpty, !recents.isEmpty {
                    Section("Recent") {
                        ForEach(recents, id: \.id) { choice in row(choice) }
                    }
                }

                Section("All decks") {
                    ForEach(matches, id: \.id) { choice in row(choice) }
                }
            }
            .searchable(text: $query, prompt: "Search decks")
            .navigationTitle("Move to deck")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { model.movePickerCard = nil }
                }
            }
            .disabled(model.isGrading)
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 460)
        #endif
        .task { await load() }
    }

    private func row(_ choice: (id: String, label: String)) -> some View {
        Button(choice.label) {
            Task { _ = await model.moveCurrent(toSubject: choice.id, label: choice.label) }
        }
        .foregroundStyle(.primary)
        .accessibilityIdentifier("review-move-target")
    }

    private func load() async {
        recentIds = RecentMoveTargets().load()

        do {
            let subjects = try await APIClient.listSubjects()
            let tree = SubjectTreePath.tree(from: subjects)

            choices = SubjectParentChoices.list(from: tree)
        } catch {
            loadFailed = true
        }
    }
}

extension View {
    func dueReviewMoveSheet(model: DueReviewModel) -> some View {
        sheet(item: Bindable(model).movePickerCard) { _ in
            DueReviewMoveSheet(model: model)
        }
    }
}
