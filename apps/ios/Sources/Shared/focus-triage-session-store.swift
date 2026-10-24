import Foundation
import PostAnkiAPI

struct FocusTriageStoredSession: Codable, Equatable {
    let server: String
    let sessionId: String
    let decisions: [TriageDecision]
}

struct FocusTriageSessionStore {
    static let key = "focusTriage.openSession"

    private let defaults: UserDefaults
    private let scope: () -> String

    init(defaults: UserDefaults = .standard, scope: @escaping () -> String = { ServerScope.current }) {
        self.defaults = defaults
        self.scope = scope
    }

    func load() -> FocusTriageStoredSession? {
        guard let data = defaults.data(forKey: Self.key),
              let stored = try? JSONDecoder().decode(FocusTriageStoredSession.self, from: data),
              stored.server == scope() else { return nil }

        return stored
    }

    func save(sessionId: String, decisions: [TriageDecision]) {
        let stored = FocusTriageStoredSession(server: scope(), sessionId: sessionId, decisions: decisions)

        if let data = try? JSONEncoder().encode(stored) { defaults.set(data, forKey: Self.key) }
    }

    func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}
