import Foundation

public protocol AddDraftStoring {
    func load(key: String) -> String
    func save(_ draft: String, key: String)
    func clear(key: String)
    func clearAll()
}

public enum AddDraftLimits {
    public static let maxChars = 10_000
    public static let keyPrefix = "postanki.add.draft."

    public static func clip(_ text: String) -> String { String(text.prefix(maxChars)) }
}

public struct UserDefaultsAddDraftStore: AddDraftStoring {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load(key: String) -> String {
        AddDraftLimits.clip(defaults.string(forKey: AddDraftLimits.keyPrefix + key) ?? "")
    }

    public func save(_ draft: String, key: String) {
        if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            clear(key: key)
        } else {
            defaults.set(AddDraftLimits.clip(draft), forKey: AddDraftLimits.keyPrefix + key)
        }
    }

    public func clear(key: String) {
        defaults.removeObject(forKey: AddDraftLimits.keyPrefix + key)
    }

    public func clearAll() {
        for name in defaults.dictionaryRepresentation().keys where name.hasPrefix(AddDraftLimits.keyPrefix) {
            defaults.removeObject(forKey: name)
        }
    }
}

public final class InMemoryAddDraftStore: AddDraftStoring {
    private var drafts: [String: String] = [:]

    public init() {}

    public func load(key: String) -> String { drafts[key] ?? "" }

    public func save(_ draft: String, key: String) {
        if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { drafts[key] = nil } else { drafts[key] = AddDraftLimits.clip(draft) }
    }

    public func clear(key: String) { drafts[key] = nil }

    public func clearAll() { drafts = [:] }
}
