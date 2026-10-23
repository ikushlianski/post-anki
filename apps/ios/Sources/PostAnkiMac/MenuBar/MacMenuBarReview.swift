import SwiftUI
import AppKit

enum MacMenuBar {
    static let enabledKey = "mac.menuBarEnabled"

    static var isHostingTests: Bool {
        ProcessInfo.processInfo.environment.keys.contains { $0.hasPrefix("XCTest") }
    }
}

struct MacMenuBarLabel: View {
    var body: some View {
        let count = PendingReviewCountStore.shared.count

        Label(count > 0 ? "\(count)" : "Review", systemImage: "checkmark.seal")
            .labelStyle(.titleAndIcon)
    }
}

struct MacMenuBarContent: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        let count = PendingReviewCountStore.shared.count

        Button(count > 0 ? "Review (\(count) due)" : "Review") {
            NSApp.activate(ignoringOtherApps: true)
            MacNavigator.shared.select("review")
            openWindow(id: "main")
        }

        Divider()

        Button("Quit PostAnki") { NSApp.terminate(nil) }
    }
}

struct MacSettingsView: View {
    @AppStorage(MacMenuBar.enabledKey) private var menuBarEnabled = true

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Toggle("Show review count in the menu bar", isOn: $menuBarEnabled)
            }
            .formStyle(.grouped)
            .fixedSize(horizontal: false, vertical: true)

            SettingsScreen()
        }
    }
}
