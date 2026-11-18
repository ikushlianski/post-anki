import Foundation

public enum ChatModelCostTier: String, Codable, Sendable, Hashable {
    case cheap
    case mid
    case premium
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)

        self = ChatModelCostTier(rawValue: raw) ?? .unknown
    }

    public var hint: String? { self == .unknown ? nil : rawValue }
}

public struct ChatModelOption: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let costTier: ChatModelCostTier
    public let note: String
    public let expiresOn: String?
    public let isDefault: Bool

    public init(
        id: String,
        label: String,
        costTier: ChatModelCostTier = .mid,
        note: String = "",
        expiresOn: String? = nil,
        isDefault: Bool = false
    ) {
        self.id = id
        self.label = label
        self.costTier = costTier
        self.note = note
        self.expiresOn = expiresOn
        self.isDefault = isDefault
    }
}

public enum ChatModelSelection {
    public static let key = "post-anki.chat-model-id"

    public static func selectedId(defaults: UserDefaults = .standard) -> String? {
        guard let stored = defaults.string(forKey: key), !stored.isEmpty else { return nil }

        return stored
    }

    public static func select(_ id: String?, defaults: UserDefaults = .standard) {
        guard let id, !id.isEmpty else {
            defaults.removeObject(forKey: key)

            return
        }

        defaults.set(id, forKey: key)
    }

    @discardableResult
    public static func validate(against options: [ChatModelOption], defaults: UserDefaults = .standard) -> String? {
        guard let stored = selectedId(defaults: defaults) else { return nil }

        if options.contains(where: { $0.id == stored }) { return stored }

        select(nil, defaults: defaults)

        return nil
    }

    public static func label(for id: String?, in options: [ChatModelOption]) -> String {
        guard let id else { return "Default" }

        return options.first { $0.id == id }?.label ?? id.split(separator: "/").last.map(String.init) ?? id
    }
}
