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

    @Test func shouldListOnlyKnowledgeInboxReviewAndSubjectsInTheSidebar() {
        let ids = MacFeatureRegistry.sidebarSections
            .flatMap { MacFeatureRegistry.sidebarFeatures(in: $0) }
            .map(\.id)

        #expect(ids == ["knowledge", "inbox", "review", "subjects"])
    }

    @Test func shouldKeepHiddenFeaturesRegisteredForMenusAndNavigation() {
        let ids = Set(MacFeatureRegistry.features.map(\.id))

        #expect(Set(["home", "ingest", "courses", "progress", "search"]).isSubset(of: ids))
        #expect(MacFeatureRegistry.features.first { $0.id == "ingest" }?.shortcut != nil)
    }

    @Test func shouldNeverHideTheLaunchFeatureFromTheSidebar() {
        #expect(MacFeatureRegistry.fallbackID == "knowledge")
        #expect(MacFeatureRegistry.feature(id: MacFeatureRegistry.fallbackID).inSidebar)
    }

    @Test func shouldKeepTheFallbackItemSoUnknownStoredSelectionsOpenKnowledge() {
        #expect(MacFeatureRegistry.feature(id: "removed-feature").id == MacFeatureRegistry.fallbackID)
    }
}
