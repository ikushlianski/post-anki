import SwiftUI

enum MacPaletteRequest {
    nonisolated(unsafe) static var pending = false
}

struct MacCommands: Commands {
    @Environment(\.openWindow) private var openWindow
    @AppStorage(MacNavigator.storageKey) private var storedSelection = MacFeatureRegistry.fallbackID

    var body: some Commands {
        SidebarCommands()
        ToolbarCommands()

        CommandGroup(replacing: .newItem) {
            Button("New Knowledge Item") {
                MacNavigator.shared.select("ingest")
            }
            .keyboardShortcut("n")
        }

        CommandGroup(after: .textEditing) {
            Button("Command Palette…") {
                MacPaletteRequest.pending = true
                openWindow(id: "main")
                NotificationCenter.default.post(name: .macShowCommandPalette, object: nil)
            }
            .keyboardShortcut("k")
        }

        CommandGroup(replacing: .help) {
            Button("Keyboard Shortcuts") {
                openWindow(id: "shortcuts")
            }
        }

        CommandMenu("Go") {
            let history = MacHistoryCenter.shared.controls(for: storedSelection)

            Button("Back") { history?.goBack() }
                .keyboardShortcut("[")
                .disabled(!(history?.canGoBack ?? false))

            Button("Forward") { history?.goForward() }
                .keyboardShortcut("]")
                .disabled(!(history?.canGoForward ?? false))

            Divider()

            ForEach(MacFeatureRegistry.visibleSections) { section in
                Section(section.title) {
                    ForEach(MacFeatureRegistry.features(in: section)) { feature in
                        goButton(feature)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func goButton(_ feature: MacFeature) -> some View {
        let button = Button(feature.title) {
            MacNavigator.shared.select(feature.id)
        }

        if let shortcut = feature.shortcut {
            button.keyboardShortcut(shortcut.keyEquivalent, modifiers: shortcut.modifiers)
        } else {
            button
        }
    }
}
