import SwiftUI

struct HighlightShortcut: Equatable, Hashable, Identifiable {
    static let defaultShortcut = HighlightShortcut(key: "d", modifiers: [.command])

    static let choices: [HighlightShortcut] = [
        defaultShortcut,
        HighlightShortcut(key: "h", modifiers: [.command, .shift]),
        HighlightShortcut(key: "h", modifiers: [.control, .command])
    ]

    let key: String
    let modifiers: EventModifiers

    private init(key: String, modifiers: EventModifiers) {
        self.key = key
        self.modifiers = modifiers
    }

    var id: String { rawValue }

    func hash(into hasher: inout Hasher) {
        hasher.combine(rawValue)
    }

    var keyboardShortcut: KeyboardShortcut {
        KeyboardShortcut(KeyEquivalent(Character(key)), modifiers: modifiers)
    }

    var label: String {
        var text = ""

        if modifiers.contains(.control) { text += "⌃" }

        if modifiers.contains(.option) { text += "⌥" }

        if modifiers.contains(.shift) { text += "⇧" }

        if modifiers.contains(.command) { text += "⌘" }

        return text + key.uppercased()
    }

    var rawValue: String {
        let names: [(EventModifiers, String)] = [(.control, "control"), (.option, "option"), (.shift, "shift"), (.command, "command")]

        return (names.filter { modifiers.contains($0.0) }.map(\.1) + [key]).joined(separator: "+")
    }

    init?(rawValue: String) {
        var parsed: EventModifiers = []
        var parts = rawValue.split(separator: "+", omittingEmptySubsequences: false).map(String.init)

        guard let key = parts.popLast(), key.count == 1, key.first?.isLetter == true || key.first?.isNumber == true else { return nil }

        for part in parts {
            switch part {
            case "control": parsed.insert(.control)
            case "option": parsed.insert(.option)
            case "shift": parsed.insert(.shift)
            case "command": parsed.insert(.command)
            default: return nil
            }
        }

        guard parsed.contains(.command) || parsed.contains(.control) || parsed.contains(.option) else { return nil }

        self.init(key: key.lowercased(), modifiers: parsed)
    }
}

struct HighlightShortcutStore {
    static let key = "highlightShortcut"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> HighlightShortcut {
        defaults.string(forKey: Self.key).flatMap(HighlightShortcut.init(rawValue:)) ?? .defaultShortcut
    }

    func save(_ shortcut: HighlightShortcut) {
        defaults.set(shortcut.rawValue, forKey: Self.key)
    }

    func reset() {
        defaults.removeObject(forKey: Self.key)
    }
}

extension HighlightShortcut {
    static func resolved(from stored: String) -> HighlightShortcut {
        HighlightShortcut(rawValue: stored) ?? .defaultShortcut
    }
}
