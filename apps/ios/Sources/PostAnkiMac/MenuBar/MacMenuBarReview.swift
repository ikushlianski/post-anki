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

        Label(count > 0 ? "\(count)" : "Knowledge Inbox", systemImage: "tray.full")
            .labelStyle(.titleAndIcon)
    }
}

struct MacMenuBarContent: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        let count = PendingReviewCountStore.shared.count

        Button(count > 0 ? "Knowledge Inbox (\(count) pending)" : "Knowledge Inbox") {
            NSApp.activate(ignoringOtherApps: true)
            MacNavigator.shared.select("inbox")
            openWindow(id: "main")
        }

        Divider()

        Button("Quit PostAnki") { NSApp.terminate(nil) }
    }
}
