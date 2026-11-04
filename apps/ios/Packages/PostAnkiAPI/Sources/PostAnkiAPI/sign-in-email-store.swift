import Foundation

public struct SignInEmailStore {
    public static let key = "postanki.lastSignInEmail"

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load() -> String {
        defaults.string(forKey: Self.key) ?? ""
    }

    public func save(_ email: String) {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmed.isEmpty { defaults.removeObject(forKey: Self.key) } else { defaults.set(trimmed, forKey: Self.key) }
    }
}
