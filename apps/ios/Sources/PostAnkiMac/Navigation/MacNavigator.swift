import SwiftUI

@MainActor
final class MacNavigator {
    static let shared = MacNavigator()
    static let storageKey = "mac.sidebarSelection"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func select(_ id: String) {
        defaults.set(id, forKey: Self.storageKey)
    }
}

extension EnvironmentValues {
    @Entry var macNavigator: MacNavigator = MainActor.assumeIsolated { MacNavigator.shared }
}
