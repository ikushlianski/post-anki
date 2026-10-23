import SwiftUI

enum MacFeatureSection: String, CaseIterable, Identifiable {
    case study
    case library
    case learn
    case manage
    case admin

    var id: String { rawValue }

    var title: String {
        switch self {
        case .study: "Study"
        case .library: "Library"
        case .learn: "Learn"
        case .manage: "Manage"
        case .admin: "Admin"
        }
    }
}

struct MacFeatureShortcut: Hashable {
    let key: Character
    var modifiers: EventModifiers = .command

    func hash(into hasher: inout Hasher) {
        hasher.combine(key)
        hasher.combine(modifiers.rawValue)
    }

    var keyEquivalent: KeyEquivalent { KeyEquivalent(key) }
}

struct MacFeature: Identifiable {
    let id: String
    let section: MacFeatureSection
    let order: Int
    let title: String
    let systemImage: String
    var shortcut: MacFeatureShortcut?
    var badge: (@MainActor () -> Int)?
    var ownsStack = false
    var inSidebar = true
    let detail: @MainActor (MacNavigator) -> AnyView
}
