import Foundation

public enum ChatModelStore {
    static let key = "chatModelId"

    public static func selectedId(defaults: UserDefaults = .standard) -> String? {
        guard let stored = defaults.string(forKey: key),
              AdminExtractionModel.all.contains(where: { $0.id == stored }) else { return nil }

        return stored
    }

    public static func select(_ id: String?, defaults: UserDefaults = .standard) {
        guard let id, AdminExtractionModel.all.contains(where: { $0.id == id }) else {
            defaults.removeObject(forKey: key)

            return
        }

        defaults.set(id, forKey: key)
    }

    public static func label(for id: String?) -> String {
        AdminExtractionModel.all.first { $0.id == id }?.label ?? "Default model"
    }
}
