import Foundation

struct ReviewSubjectExpansionStore {
    static let key = "reviewSubjectExpandedIds"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> Set<String> {
        Set(defaults.stringArray(forKey: Self.key) ?? [])
    }

    func save(_ expanded: Set<String>) {
        defaults.set(expanded.sorted(), forKey: Self.key)
    }
}
