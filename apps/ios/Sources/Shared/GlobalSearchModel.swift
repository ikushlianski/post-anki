import PostAnkiAPI
import SwiftUI

enum GlobalSearchScope: String, CaseIterable, Identifiable {
    case everything = "Everything"
    case ranked = "Topics and modules"

    var id: String { rawValue }
}

@Observable
@MainActor
final class GlobalSearchModel {
    var query = ""
    var scope: GlobalSearchScope = .everything
    var everything: GlobalSearchResponse?
    var ranked: [GlobalSearchRankedResult]?
    var isLoading = false
    var errorMessage: String?
    var openMessage: String?
    var openedTopic: Topic?
    var openedCurriculum: Curriculum?
    var openedSubject: GlobalSearchItem?

    private var searchTask: Task<Void, Never>?
    private var curriculaCache: [Curriculum]?
    private var detailCache: [String: CurriculumDetail] = [:]

    var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var hasResults: Bool {
        switch scope {
        case .everything: everything.map { !$0.isEmpty } ?? false
        case .ranked: ranked.map { !$0.isEmpty } ?? false
        }
    }

    var hasSearched: Bool {
        switch scope {
        case .everything: everything != nil
        case .ranked: ranked != nil
        }
    }

    func scheduleSearch() {
        searchTask?.cancel()

        guard !trimmedQuery.isEmpty else {
            everything = nil
            ranked = nil
            isLoading = false
            errorMessage = nil

            return
        }

        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))

            guard !Task.isCancelled else { return }

            await runSearch()
        }
    }

    func runSearch() async {
        let text = trimmedQuery
        let activeScope = scope

        guard !text.isEmpty else { return }

        isLoading = true
        errorMessage = nil
        defer { if text == trimmedQuery { isLoading = false } }

        do {
            switch activeScope {
            case .everything:
                let result = try await APIClient.globalSearch(query: text)

                if text == trimmedQuery { everything = result }
            case .ranked:
                let result = try await APIClient.searchTopicsAndModules(query: text, limit: 20)

                if text == trimmedQuery { ranked = result }
            }
        } catch where ProgressLoadError.from(error) == nil {
            return
        } catch {
            if text == trimmedQuery { errorMessage = StudyToolsError.message(for: error) }
        }
    }

    func openCurriculum(id: String) async {
        openMessage = nil

        guard let curriculum = await curriculum(id: id) else {
            openMessage = Self.missingMessage

            return
        }

        openedCurriculum = curriculum
    }

    func openTopic(id: String, curriculumId: String?) async {
        openMessage = nil

        guard let curriculumId, let detail = await detail(of: curriculumId),
              let topic = detail.modules.flatMap(\.topics).first(where: { $0.id == id })
        else {
            openMessage = Self.missingMessage

            return
        }

        openedTopic = topic
    }

    func courses(of subjectId: String) async -> [Curriculum] {
        await loadCurricula().filter { $0.subjectId == subjectId }
    }

    private static let missingMessage = "Couldn't open this. It may have been removed."

    private func loadCurricula() async -> [Curriculum] {
        if let curriculaCache { return curriculaCache }

        let fetched = (try? await APIClient.listCurricula()) ?? []

        if !fetched.isEmpty { curriculaCache = fetched }

        return fetched
    }

    private func curriculum(id: String) async -> Curriculum? {
        await loadCurricula().first { $0.id == id }
    }

    private func detail(of curriculumId: String) async -> CurriculumDetail? {
        if let cached = detailCache[curriculumId] { return cached }

        guard let fetched = try? await APIClient.getCurriculumDetail(curriculumId) else { return nil }

        detailCache[curriculumId] = fetched

        return fetched
    }
}
