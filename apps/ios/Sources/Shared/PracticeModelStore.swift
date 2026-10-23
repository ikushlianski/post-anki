import PostAnkiAPI

@MainActor
final class PracticeModelStore {
    static let shared = PracticeModelStore()

    private var models: [String: PracticeModel] = [:]

    func model(for subject: PracticeSubject) -> PracticeModel {
        if let existing = models[subject.id] { return existing }

        let created = PracticeModel(subject: subject)
        models[subject.id] = created

        return created
    }

    func reset() {
        models = [:]
    }
}
