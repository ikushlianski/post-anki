import Observation
import PostAnkiAPI

@Observable
@MainActor
final class StudyPlanModel {
    let subjectId: String
    var subjectNames: [String: String] = [:]
    var options: SubjectStudyOptions?
    var forecast: StudyForecast?
    var draft: StudyPlanDraft?
    var isLoading = false
    var isSaving = false
    var loadMessage: String?
    var forecastMessage: String?
    var saveMessage: String?
    var justSaved = false

    init(subjectId: String) {
        self.subjectId = subjectId
    }

    var hasLoaded: Bool { options != nil }

    var hasChanges: Bool {
        guard let options, let draft else { return false }

        return !draft.update(from: options).isEmpty
    }

    var canSave: Bool { hasChanges && !isSaving }

    func load() async {
        guard !isLoading else { return }

        isLoading = true
        loadMessage = nil
        defer { isLoading = false }

        async let names = Self.fetchNames()
        async let fresh = Self.fetch { try await APIClient.studyOptions(subjectId: self.subjectId) }
        let (nameMap, result) = await (names, fresh)

        subjectNames = nameMap

        switch result {
        case .success(let value):
            options = value
            draft = StudyPlanDraft(value)
        case .failure(let error):
            if let text = StudyPlanMessage.load(error) { loadMessage = text }
        }

        if options != nil { await loadForecast() }
    }

    func loadForecast() async {
        switch await Self.fetch({ try await APIClient.studyForecast(subjectId: self.subjectId) }) {
        case .success(let value):
            forecast = value
            forecastMessage = nil
        case .failure(let error):
            if let text = StudyPlanMessage.load(error) {
                forecastMessage = text
            }
        }
    }

    func save(today: String) async {
        guard !isSaving, let options, let draft else { return }

        if let problem = draft.validationMessage(today: today) {
            saveMessage = problem
            return
        }

        let update = draft.update(from: options)

        guard !update.isEmpty else { return }

        isSaving = true
        saveMessage = nil
        justSaved = false
        defer { isSaving = false }

        do {
            let saved = try await APIClient.updateStudyOptions(subjectId: subjectId, update)

            self.options = saved
            self.draft = StudyPlanDraft(saved)
            justSaved = true
            await loadForecast()
        } catch {
            guard let text = StudyPlanMessage.save(error) else { return }

            saveMessage = text

            if !StudyPlanMessage.keepsDraft(error) { self.draft = StudyPlanDraft(options) }
        }
    }

    func discard() {
        guard let options else { return }

        draft = StudyPlanDraft(options)
        saveMessage = nil
        justSaved = false
    }

    private static func fetchNames() async -> [String: String] {
        guard let subjects = try? await APIClient.listSubjects() else { return [:] }

        return Dictionary(subjects.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
    }

    private static func fetch<T: Sendable>(_ call: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await call()) } catch { return .failure(error) }
    }
}
