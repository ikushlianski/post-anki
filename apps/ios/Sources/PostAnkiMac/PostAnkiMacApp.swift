import SwiftUI

@main
struct PostAnkiMacApp: App {
    @AppStorage(MacMenuBar.enabledKey) private var menuBarEnabled = true

    init() {
        MacLaunchCheck.applyDevAddress()
        MacQueueFlushTrigger.shared.start()
    }

    var body: some Scene {
        Window("PostAnki", id: "main") {
            MacRootView()
                .frame(minWidth: 760, minHeight: 520)
                .background(MacWindowFrameAutosave())
        }
        .defaultSize(width: 1000, height: 700)
        .commands {
            MacCommands()
            #if DEBUG
            PowerSyncSpikeCommands()
            #endif
        }

        #if DEBUG
        Window("PowerSync Spike", id: "powersync-spike") {
            PowerSyncSpikeView()
        }
        #endif

        Window("Keyboard Shortcuts", id: "shortcuts") {
            MacShortcutHelpView()
        }
        .defaultSize(width: 520, height: 520)

        MenuBarExtra(isInserted: .constant(menuBarEnabled && !MacMenuBar.isHostingTests)) {
            MacMenuBarContent()
        } label: {
            MacMenuBarLabel()
        }

        Settings {
            MacSettingsView()
                .frame(minWidth: 480, idealWidth: 480, minHeight: 400)
        }
    }
}
