import Foundation

@MainActor
final class MacStudySessionRunStore {
    static let shared = MacStudySessionRunStore()

    private var models: [String: StudySessionRunModel] = [:]

    func model(for sessionId: String) -> StudySessionRunModel {
        if let existing = models[sessionId] { return existing }

        let created = StudySessionRunModel(sessionId: sessionId)
        models[sessionId] = created

        return created
    }
}
