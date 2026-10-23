import Foundation
import Testing
@testable import PostAnkiMac

@MainActor
struct MacNavigationHistoryTests {
    @Test func shouldStepBackAndForwardThroughOpenedItems() {
        let history = MacStackHistory<Int>()
        history.setPath([1, 2])

        history.goBack()
        #expect(history.path == [1])
        #expect(history.canGoForward)

        history.goForward()
        #expect(history.path == [1, 2])
        #expect(!history.canGoForward)
    }

    @Test func shouldDropForwardHistoryWhenTheUserOpensSomethingNew() {
        let history = MacStackHistory<Int>()
        history.setPath([1, 2])
        history.goBack()

        history.setPath([1, 3])

        #expect(!history.canGoForward)
    }

    @Test func shouldKeepForwardHistoryWhenTheToolbarBackButtonPops() {
        let history = MacStackHistory<Int>()
        history.setPath([1, 2])

        history.setPath([1])

        #expect(history.canGoForward)
    }

    @Test func shouldDropForwardHistoryWhenAnEqualLengthPathReplacesTheCurrentOne() {
        let history = MacStackHistory<Int>()
        history.setPath([1, 2])
        history.goBack()
        history.setPath([3])

        #expect(history.path == [3])
        #expect(!history.canGoForward)
    }

    @Test func shouldDropForwardHistoryWhenAShorterPathIsNotAPrefixOfTheCurrentOne() {
        let history = MacStackHistory<Int>()
        history.setPath([1, 2, 3])
        history.goBack()
        history.setPath([9, 8])
        history.setPath([7])

        #expect(!history.canGoForward)
    }

    @Test func shouldForgetEveryEntrysHistoryWhenTheServerChanges() {
        let center = MacHistoryCenter()
        let tags = center.stack(for: "tags", of: Int.self)
        tags.setPath([1, 2])
        tags.goBack()
        let before = center.revision

        center.reset()

        #expect(tags.path.isEmpty)
        #expect(!tags.canGoForward)
        #expect(center.revision > before)
        #expect(center.controls(for: "tags")?.canGoBack == false)
    }

    @Test func shouldNotGoBackFromTheEntryRoot() {
        let history = MacStackHistory<Int>()

        history.goBack()

        #expect(!history.canGoBack)
    }

    @Test func shouldReplaceTheOpenedItemWhenOpeningFromTheEntryList() {
        let history = MacStackHistory<Int>()
        history.open(1)
        history.open(2)

        #expect(history.path == [2])
    }

    @Test func shouldStackASecondScreenOnTopOfTheFirst() {
        let history = MacStackHistory<Int>()
        history.open(1)
        history.push(2)
        history.goBack()

        #expect(history.path == [1])
        #expect(history.canGoForward)
    }

    @Test func shouldKeepOneHistoryPerSidebarEntry() {
        let center = MacHistoryCenter()
        let first = center.stack(for: "tags", of: Int.self)
        first.open(7)

        #expect(center.stack(for: "tags", of: Int.self).path == [7])
        #expect(center.stack(for: "subjects", of: Int.self).path.isEmpty)
    }

    @Test func shouldReserveBackAndForwardShortcutsAgainstSidebarEntries() {
        #expect(MacFeatureRegistry.reservedShortcuts.contains(MacFeatureShortcut(key: "[")))
        #expect(MacFeatureRegistry.reservedShortcuts.contains(MacFeatureShortcut(key: "]")))
    }

    @Test func shouldReloadAfterMoreThanFiveMinutesAway() {
        let now = Date()

        #expect(MacActivationReloadPolicy.shouldReload(resignedAt: now.addingTimeInterval(-301), now: now, hasUnsentInput: false))
        #expect(!MacActivationReloadPolicy.shouldReload(resignedAt: now.addingTimeInterval(-299), now: now, hasUnsentInput: false))
    }

    @Test func shouldNotReloadAScreenWithUnsentInput() {
        let now = Date()

        #expect(!MacActivationReloadPolicy.shouldReload(resignedAt: now.addingTimeInterval(-3600), now: now, hasUnsentInput: true))
    }

    @Test func shouldNotReloadWhenTheAppNeverWentToTheBackground() {
        #expect(!MacActivationReloadPolicy.shouldReload(resignedAt: nil, now: Date(), hasUnsentInput: false))
    }
}
