import SwiftUI
import Testing
@testable import PostAnkiMac

@MainActor
struct MacShortcutHelpTests {
    private var allEntries: [MacShortcutHelpEntry] { MacShortcutHelp.groups.flatMap(\.entries) }

    @Test func shouldWriteModifiersInTheOrderControlOptionShiftCommand() {
        let all: EventModifiers = [.command, .shift, .option, .control]

        #expect(MacShortcutHelp.display(MacFeatureShortcut(key: "m", modifiers: all)) == "Ctrl-Option-Shift-Cmd-M")
        #expect(MacShortcutHelp.display(MacFeatureShortcut(key: "m", modifiers: [.command, .shift])) == "Shift-Cmd-M")
    }

    @Test func shouldShowTheKeyInCapitalsWithCommandAsTheDefaultModifier() {
        #expect(MacShortcutHelp.display(MacFeatureShortcut(key: "k")) == "Cmd-K")
        #expect(MacShortcutHelp.display(MacFeatureShortcut(key: ",")) == "Cmd-,")
    }

    @Test func shouldStartWithGeneralShortcutsIncludingThePaletteAndEndWithPracticeAndReview() throws {
        let groups = MacShortcutHelp.groups

        #expect(groups.first?.title == "General")
        #expect(groups.last?.title == "Practice and review")
        #expect(groups.first?.entries.contains { $0.keys == "Cmd-K" } == true)
    }

    @Test func shouldListEveryAppReservedShortcutSoTheHelpNeverHidesOne() {
        let listed = Set(allEntries.map(\.keys))
        let missing = MacFeatureRegistry.reservedShortcuts
            .map(MacShortcutHelp.display)
            .filter { !listed.contains($0) }

        #expect(missing.isEmpty)
    }

    @Test func shouldListEverySidebarShortcutUnderItsSectionWithTheEntryTitle() {
        for section in MacFeatureSection.allCases {
            let expected = MacFeatureRegistry.features(in: section).compactMap { feature in
                feature.shortcut.map { MacShortcutHelpEntry(keys: MacShortcutHelp.display($0), action: feature.title) }
            }
            let group = MacShortcutHelp.groups.first { $0.title == "Go: \(section.title)" }

            #expect(group?.entries.map(\.id) ?? [] == expected.map(\.id))
        }
    }

    @Test func shouldOmitAGoGroupForASectionWithoutShortcuts() {
        let titles = MacShortcutHelp.groups.map(\.title)

        for section in MacFeatureSection.allCases where MacFeatureRegistry.features(in: section).allSatisfy({ $0.shortcut == nil }) {
            #expect(!titles.contains("Go: \(section.title)"))
        }
    }

    @Test func shouldGiveEveryGroupAndEntryAUniqueIdSoTheListNeverMergesRows() {
        let groupIds = MacShortcutHelp.groups.map(\.id)

        #expect(Set(groupIds).count == groupIds.count)

        for group in MacShortcutHelp.groups {
            let ids = group.entries.map(\.id)

            #expect(Set(ids).count == ids.count)
        }
    }

    @Test func shouldNeverShowAnEmptyGroupOrAnEntryWithoutText() {
        #expect(MacShortcutHelp.groups.allSatisfy { !$0.entries.isEmpty })
        #expect(allEntries.allSatisfy { !$0.keys.isEmpty && !$0.action.isEmpty })
    }
}
