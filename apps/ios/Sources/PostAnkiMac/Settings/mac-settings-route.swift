import AppKit
import SwiftUI

@MainActor
enum MacSettingsRoute {
    static let featureID = "settings"

    static func select(navigator: MacNavigator = .shared) {
        navigator.select(featureID)
    }

    static func show(openWindow: OpenWindowAction, navigator: MacNavigator = .shared) {
        select(navigator: navigator)
        openWindow(id: "main")
        NSApp.activate()
    }
}
