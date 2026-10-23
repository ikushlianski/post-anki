import AppKit
import PostAnkiAPI
import SwiftUI

struct MacPhraseBankView: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    private enum Scope: String, CaseIterable, Identifiable {
        case all = "All"
        case learning = "Learning"
        case mastered = "Mastered"

        var id: String { rawValue }
    }

    @State private var model: PhraseBankModel
    @State private var scope = Scope.all
    @State private var search = ""
    @State private var selection: PhraseBankEntry.ID?

    init(subject: PracticeSubject) {
        _model = State(initialValue: PhraseBankModel(subjectId: subject.id))
    }

    private var entries: [PhraseBankEntry] {
        guard let bank = model.bank else { return [] }

        let scoped: [PhraseBankEntry] = switch scope {
        case .all: bank.active + bank.mastered
        case .learning: bank.active
        case .mastered: bank.mastered
        }

        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !query.isEmpty else { return scoped }

        return scoped.filter {
            $0.phraseText.localizedCaseInsensitiveContains(query)
                || ($0.category?.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    var body: some View {
        content
            .safeAreaInset(edge: .top, spacing: 0) {
                MacLibraryErrorBanner(message: model.bank == nil ? nil : model.errorMessage)
            }
            .navigationTitle("Phrase bank")
            .searchable(text: $search, prompt: "Search phrases")
            .toolbar {
                ToolbarItem {
                    Picker("Show", selection: $scope) {
                        ForEach(Scope.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                ToolbarItem {
                    MacReloadButton(isDisabled: model.isLoading) { Task { await model.load() } }
                }
            }
            .task { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if model.bank == nil, let message = model.errorMessage {
            MacLoadStateView(failure: model.failureKind ?? .other, detail: message) {
                Task { await model.load() }
            }
        } else if model.bank == nil {
            ProgressView()
        } else if let bank = model.bank, bank.active.isEmpty && bank.mastered.isEmpty {
            MacEmptyStateView(
                title: "No phrases tracked yet",
                systemImage: "books.vertical",
                message: "Practice a batch and your phrases are tracked here."
            )
        } else if entries.isEmpty {
            ContentUnavailableView.search
        } else {
            Table(entries, selection: $selection) {
                TableColumn("Phrase", value: \.phraseText)

                TableColumn("Category") { Text($0.category ?? "") }
                    .width(min: 80 * zoom, ideal: 140 * zoom)

                TableColumn("Status") { Text($0.statusLabel) }
                    .width(110 * zoom)
            }
            .contextMenu(forSelectionType: PhraseBankEntry.ID.self) { ids in
                if let entry = entries.first(where: { ids.contains($0.id) }) {
                    Button("Copy phrase") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(entry.phraseText, forType: .string)
                    }
                }
            }
        }
    }
}
