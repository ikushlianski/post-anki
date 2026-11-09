import Foundation

protocol LastSubjectStoring {
    func load() -> String?
    func save(_ id: String?)
}

struct UserDefaultsLastSubjectStore: LastSubjectStoring {
    static let key = "addKnowledgeLastSubjectId"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> String? {
        defaults.string(forKey: Self.key)
    }

    func save(_ id: String?) {
        if let id {
            defaults.set(id, forKey: Self.key)
        } else {
            defaults.removeObject(forKey: Self.key)
        }
    }
}
