import Foundation

struct RecentMoveTargets {
    static let key = "dueReviewRecentMoveTargets"
    static let limit = 5

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> [String] {
        guard let data = defaults.data(forKey: Self.key),
              let ids = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }

        return Array(ids.prefix(Self.limit))
    }

    func record(_ id: String) {
        let next = Array(([id] + load().filter { $0 != id }).prefix(Self.limit))

        guard let data = try? JSONEncoder().encode(next) else { return }

        defaults.set(data, forKey: Self.key)
    }

    static func ordered(
        recent: [String],
        choices: [(id: String, label: String)]
    ) -> [(id: String, label: String)] {
        recent.compactMap { id in choices.first { $0.id == id } }
    }

    static func filtered(
        _ choices: [(id: String, label: String)],
        query: String
    ) -> [(id: String, label: String)] {
        let words = query.lowercased().split(whereSeparator: \.isWhitespace)

        guard !words.isEmpty else { return choices }

        return choices.filter { choice in
            let text = choice.label.lowercased()

            return words.allSatisfy { text.contains($0) }
        }
    }
}
