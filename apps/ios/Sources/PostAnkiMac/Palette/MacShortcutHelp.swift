import SwiftUI

struct MacShortcutHelpEntry: Identifiable {
    let keys: String
    let action: String

    var id: String { keys + action }
}

struct MacShortcutHelpGroup: Identifiable {
    let title: String
    let entries: [MacShortcutHelpEntry]

    var id: String { title }
}

enum MacShortcutHelp {
    static func display(_ shortcut: MacFeatureShortcut) -> String {
        var text = ""

        if shortcut.modifiers.contains(.control) { text += "Ctrl-" }
        if shortcut.modifiers.contains(.option) { text += "Option-" }
        if shortcut.modifiers.contains(.shift) { text += "Shift-" }
        if shortcut.modifiers.contains(.command) { text += "Cmd-" }

        return text + String(shortcut.key).uppercased()
    }

    @MainActor
    static var groups: [MacShortcutHelpGroup] {
        let goGroups = MacFeatureRegistry.visibleSections.compactMap { section -> MacShortcutHelpGroup? in
            let entries = MacFeatureRegistry.features(in: section).compactMap { feature -> MacShortcutHelpEntry? in
                feature.shortcut.map { MacShortcutHelpEntry(keys: display($0), action: feature.title) }
            }

            return entries.isEmpty ? nil : MacShortcutHelpGroup(title: "Go: \(section.title)", entries: entries)
        }

        return [general] + goGroups + [practice]
    }

    private static let general = MacShortcutHelpGroup(title: "General", entries: [
        MacShortcutHelpEntry(keys: "Cmd-K", action: "Command palette: jump to any sidebar entry"),
        MacShortcutHelpEntry(keys: "Cmd-[", action: "Back within the current sidebar entry"),
        MacShortcutHelpEntry(keys: "Cmd-]", action: "Forward within the current sidebar entry"),
        MacShortcutHelpEntry(keys: "Cmd-N", action: "New Knowledge Item"),
        MacShortcutHelpEntry(keys: "Cmd-R", action: "Reload the current screen"),
        MacShortcutHelpEntry(keys: "Cmd-F", action: "Focus the search field"),
        MacShortcutHelpEntry(keys: "Cmd-,", action: "Settings"),
        MacShortcutHelpEntry(keys: "Cmd-+", action: "Zoom In (Cmd-= also works)"),
        MacShortcutHelpEntry(keys: "Cmd--", action: "Zoom Out"),
        MacShortcutHelpEntry(keys: "Cmd-0", action: "Actual Size"),
        MacShortcutHelpEntry(keys: "Option-Cmd-S", action: "Reserved for sidebar toggling"),
        MacShortcutHelpEntry(keys: "Shift-Cmd-M", action: "Move selected knowledge to a subject")
    ])

    private static let practice = MacShortcutHelpGroup(title: "Practice and review", entries: [
        MacShortcutHelpEntry(keys: "Return", action: "Quick practice: submit the answer, then move to the next question"),
        MacShortcutHelpEntry(keys: "Shift-Return", action: "Quick practice: new line in the answer"),
        MacShortcutHelpEntry(keys: "Return", action: "Language practice: continue after grading"),
        MacShortcutHelpEntry(keys: "Cmd-Return", action: "Decide: challenge my thinking; Writing check: check")
    ])
}

struct MacShortcutHelpView: View {
    var body: some View {
        List {
            ForEach(MacShortcutHelp.groups) { group in
                Section(group.title) {
                    ForEach(group.entries) { entry in
                        HStack {
                            Text(entry.action)

                            Spacer()

                            Text(entry.keys)
                                .font(.body.monospaced())
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .frame(minWidth: 460, minHeight: 420)
    }
}
