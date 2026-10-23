import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class NotesSearchModel {
    var query = ""
    var results: [Note] = []
    var isSearching = false
    var errorMessage: String?
    var hasSearched = false

    private var searchTask: Task<Void, Never>?

    var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func queryChanged() {
        searchTask?.cancel()
        let text = trimmedQuery

        guard !text.isEmpty else {
            results = []
            hasSearched = false
            isSearching = false
            errorMessage = nil
            return
        }

        isSearching = true
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }

            await run(text)
        }
    }

    private func run(_ text: String) async {
        do {
            let found = try await APIClient.searchNotes(query: text)
            guard !Task.isCancelled else { return }

            results = found
            errorMessage = nil
            hasSearched = true
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            guard !Task.isCancelled else { return }

            errorMessage = StudyToolsError.message(for: error)
        }

        isSearching = false
    }
}

struct NotesSearchScreen: View {
    @State private var model = NotesSearchModel()

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
            }

            if model.trimmedQuery.isEmpty {
                ContentUnavailableView(
                    "Search all your notes",
                    systemImage: "magnifyingglass"
                )
            } else if model.isSearching && model.results.isEmpty {
                ProgressView()
            } else if model.hasSearched && model.results.isEmpty && model.errorMessage == nil {
                ContentUnavailableView.search(text: model.trimmedQuery)
            } else {
                ForEach(model.results) { note in
                    NoteRow(note: note, showsKind: true)
                }
            }
        }
        .navigationTitle("Search notes")
        .searchable(text: $model.query)
        .onChange(of: model.query) { _, _ in model.queryChanged() }
    }
}
