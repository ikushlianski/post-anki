import Foundation

struct TriageHistoryStoredIds: Codable, Equatable {
    let server: String
    var ids: [String]
}

struct TriageHistoryStore {
    static let key = "focusTriage.sessionHistory"
    static let maxIds = 100

    private let defaults: UserDefaults
    private let scope: () -> String

    init(defaults: UserDefaults = .standard, scope: @escaping () -> String = { ServerScope.current }) {
        self.defaults = defaults
        self.scope = scope
    }

    func ids() -> [String] {
        guard let data = defaults.data(forKey: Self.key),
              let stored = try? JSONDecoder().decode(TriageHistoryStoredIds.self, from: data),
              stored.server == scope() else { return [] }

        return stored.ids
    }

    func record(_ sessionId: String) {
        var current = ids()

        guard !current.contains(sessionId) else { return }

        current.append(sessionId)

        let stored = TriageHistoryStoredIds(server: scope(), ids: Array(current.suffix(Self.maxIds)))

        if let data = try? JSONEncoder().encode(stored) { defaults.set(data, forKey: Self.key) }
    }
}
