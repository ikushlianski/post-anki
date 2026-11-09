import PostAnkiAPI
import SwiftUI

@main
struct PostAnkiMacApp: App {
    @AppStorage(MacMenuBar.enabledKey) private var menuBarEnabled = true

    init() {
        if !MacMenuBar.isHostingTests { MacSandboxMigration.runIfNeeded() }
        MacLaunchCheck.applyDevAddress()
        APIClient.publishSharedBaseURL()
        MacQueueFlushTrigger.shared.start()
        MacUpdateChecker.shared.start()
        #if DEBUG
        Self.applyDevDockIcon()
        Self.quitOtherDevCopies()
        #endif
    }

    #if DEBUG
    private static func applyDevDockIcon() {
        guard let url = Bundle.main.url(forResource: "AppIconDev", withExtension: "icns"),
              let image = NSImage(contentsOf: url)
        else { return }

        NSApplication.shared.applicationIconImage = image
    }

    private static func quitOtherDevCopies() {
        guard !MacMenuBar.isHostingTests, let id = Bundle.main.bundleIdentifier else { return }

        for app in NSRunningApplication.runningApplications(withBundleIdentifier: id)
        where app.processIdentifier != ProcessInfo.processInfo.processIdentifier
            && app.bundleURL?.path.contains("/Build/Products/Debug/") == true {
            app.terminate()
        }
    }
    #endif

    var body: some Scene {
        Window("PostAnki", id: "main") {
            MacRootView()
                .injectionReloadable()
                .macZoomed()
                .frame(minWidth: 760, minHeight: 520)
                .background(MacWindowFrameAutosave())
        }
        .defaultSize(width: 1000, height: 700)
        .commands {
            MacCommands()
            #if DEBUG && POWERSYNC_SPIKE
            PowerSyncSpikeCommands()
            #endif
        }

        #if DEBUG && POWERSYNC_SPIKE
        Window("PowerSync Spike", id: "powersync-spike") {
            PowerSyncSpikeView()
        }
        #endif

        Window("Keyboard Shortcuts", id: "shortcuts") {
            MacShortcutHelpView()
                .macZoomed()
        }
        .defaultSize(width: 520, height: 520)

        MenuBarExtra(isInserted: .constant(menuBarEnabled && !MacMenuBar.isHostingTests)) {
            MacMenuBarContent()
        } label: {
            MacMenuBarLabel()
        }
    }
}
