import SwiftUI

@MainActor
enum MacLibraryFeatures {
    static let features: [MacFeature] = [
        MacFeature(
            id: "inbox",
            section: .library,
            order: 30,
            title: "Inbox",
            systemImage: "tray",
            detail: { _ in AnyView(MacInboxView()) }
        ),
        MacFeature(
            id: "sources",
            section: .library,
            order: 40,
            title: "Sources",
            systemImage: "books.vertical",
            detail: { _ in AnyView(MacSourcesView()) }
        ),
        MacFeature(
            id: "content-inbox",
            section: .library,
            order: 50,
            title: "Content inbox",
            systemImage: "tray.full",
            detail: { _ in AnyView(MacContentInboxView()) }
        ),
        MacFeature(
            id: "tags",
            section: .library,
            order: 60,
            title: "Tags",
            systemImage: "tag",
            ownsStack: true,
            detail: { _ in AnyView(MacTagsView()) }
        ),
        MacFeature(
            id: "search",
            section: .library,
            order: 70,
            title: "Search",
            systemImage: "magnifyingglass",
            shortcut: MacFeatureShortcut(key: "f", modifiers: [.command, .shift]),
            detail: { _ in AnyView(GlobalSearchScreen()) }
        ),
        MacFeature(
            id: "notes",
            section: .library,
            order: 80,
            title: "Notes",
            systemImage: "note.text",
            detail: { _ in AnyView(NotesSearchScreen()) }
        ),
        MacFeature(
            id: "notion-import",
            section: .library,
            order: 100,
            title: "Notion import",
            systemImage: "square.and.arrow.down",
            detail: { _ in AnyView(MacNotionImportView()) }
        )
    ]
}
