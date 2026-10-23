import Testing
@testable import PostAnkiMac

@MainActor
struct MacFeatureRegistryTests {
    @Test func shouldHaveNoRegistryValidationProblems() {
        #expect(MacFeatureRegistry.validationProblems().isEmpty)
    }

    @Test func shouldGiveEverySidebarItemAUniqueId() {
        let ids = MacFeatureRegistry.features.map(\.id)

        #expect(Set(ids).count == ids.count)
    }

    @Test func shouldNotBindTheSameShortcutToTwoSidebarItems() {
        let shortcuts = MacFeatureRegistry.features.compactMap(\.shortcut)

        #expect(Set(shortcuts).count == shortcuts.count)
    }

    @Test func shouldNotShadowAppCommandShortcuts() {
        let clashes = MacFeatureRegistry.features
            .filter { $0.shortcut.map(MacFeatureRegistry.reservedShortcuts.contains) ?? false }
            .map(\.id)

        #expect(clashes.isEmpty)
    }

    @Test func shouldListAtLeastOneItemInEverySidebarGroup() {
        let empty = MacFeatureSection.allCases
            .filter { MacFeatureRegistry.features(in: $0).isEmpty }
            .map(\.title)

        #expect(empty.isEmpty)
        #expect(MacFeatureRegistry.visibleSections == MacFeatureSection.allCases)
    }

    @Test func shouldKeepTheFallbackItemSoUnknownStoredSelectionsOpenHome() {
        #expect(MacFeatureRegistry.feature(id: "removed-feature").id == MacFeatureRegistry.fallbackID)
    }
}
