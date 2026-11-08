import Foundation

public struct SharedAccess: Sendable, Equatable {
    public static let publishedBaseURLKey = "apiBaseURL.published"

    public let keychainGroup: String?
    public let appGroup: String?
    public let isExtension: Bool

    public init(info: [String: Any]?) {
        keychainGroup = Self.configured(info?["PostAnkiKeychainGroup"])
        appGroup = Self.configured(info?["PostAnkiAppGroup"])
        isExtension = info?["NSExtension"] != nil
    }

    public static let current = SharedAccess(info: Bundle.main.infoDictionary)

    private static func configured(_ value: Any?) -> String? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty,
              !text.contains("$(")
        else { return nil }

        return text
    }

    var defaults: UserDefaults? {
        appGroup.flatMap { UserDefaults(suiteName: $0) }
    }

    public static func publish(baseURL: String, to defaults: UserDefaults?) {
        defaults?.set(baseURL, forKey: publishedBaseURLKey)
    }

    public static func publishedBaseURL(from defaults: UserDefaults?) -> String? {
        defaults?.string(forKey: publishedBaseURLKey)
    }
}

enum TokenResolution {
    struct Outcome: Equatable {
        let token: String?
        let copyToShared: Bool
    }

    static func resolve(shared: String?, legacy: String?, sharedAvailable: Bool) -> Outcome {
        if let shared { return Outcome(token: shared, copyToShared: false) }

        return Outcome(token: legacy, copyToShared: sharedAvailable && legacy != nil)
    }
}
