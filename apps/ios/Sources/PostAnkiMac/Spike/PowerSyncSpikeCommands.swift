import SwiftUI

#if DEBUG
struct PowerSyncSpikeCommands: Commands {
    @Environment(\.openWindow) private var openWindow

    var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("PowerSync Spike") { openWindow(id: "powersync-spike") }
                .keyboardShortcut("p", modifiers: [.command, .option, .shift])
        }
    }
}
#endif
