import Foundation
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

    @Test func shouldOfferGeneralConnectionAndAdminAsTheSettingsPanes() {
        #expect(MacSettingsPane.allCases.map(\.title) == ["General", "Connection", "Admin"])
        #expect(Set(MacSettingsPane.allCases.map(\.systemImage)).count == MacSettingsPane.allCases.count)
    }

    @Test func shouldSelectTheSettingsSidebarPageWhenTheSettingsShortcutFires() throws {
        let suite = "settings-route-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        MacSettingsRoute.select(navigator: MacNavigator(defaults: defaults))

        let stored = try #require(defaults.string(forKey: MacNavigator.storageKey))

        #expect(MacFeatureRegistry.feature(id: stored).title == "Settings")
        #expect(MacFeatureRegistry.feature(id: stored).inSidebar)
    }

    @Test func shouldListTodayKnowledgeReviewChatAddKnowledgeSubjectsSettingsAccountAndAboutInTheSidebarWhileTriageIsOff() {
        let ids = MacFeatureRegistry.sidebarSections
            .flatMap { MacFeatureRegistry.sidebarFeatures(in: $0) }
            .map(\.id)

        #expect(ids == ["home", "knowledge", "review", "chat", "ingest", "subjects", "settings", "account", "about"])
    }

    @Test func shouldKeepHiddenFeaturesRegisteredForMenusAndNavigation() {
        let ids = Set(MacFeatureRegistry.features.map(\.id))

        #expect(Set(["ingest", "courses", "progress", "search"]).isSubset(of: ids))
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
