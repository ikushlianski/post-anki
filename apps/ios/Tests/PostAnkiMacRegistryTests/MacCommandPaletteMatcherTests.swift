import SwiftUI
import Testing
@testable import PostAnkiMac

@MainActor
struct MacCommandPaletteMatcherTests {
    private func feature(_ id: String, _ title: String, in section: MacFeatureSection = .study) -> MacFeature {
        MacFeature(
            id: id,
            section: section,
            order: 0,
            title: title,
            systemImage: "circle",
            detail: { _ in AnyView(EmptyView()) }
        )
    }

    @Test func shouldShowEveryEntryInSidebarOrderWhenTheQueryIsBlank() {
        let features = [feature("a", "Home"), feature("b", "Courses"), feature("c", "Tags")]

        #expect(MacCommandPaletteMatcher.results(query: "", in: features).map(\.id) == ["a", "b", "c"])
        #expect(MacCommandPaletteMatcher.results(query: "   ", in: features).map(\.id) == ["a", "b", "c"])
    }

    @Test func shouldRankTitlePrefixAboveTitleContainsAboveGroupAboveLooseLetters() {
        let prefix = MacCommandPaletteMatcher.score(query: "pro", title: "Progress", group: "Study")
        let contains = MacCommandPaletteMatcher.score(query: "gres", title: "Progress", group: "Study")
        let group = MacCommandPaletteMatcher.score(query: "stu", title: "Progress", group: "Study")
        let loose = MacCommandPaletteMatcher.score(query: "pgs", title: "Progress", group: "Study")

        #expect(prefix == 400)
        #expect(contains == 300)
        #expect(group == 200)
        #expect(loose == 100)
    }

    @Test func shouldIgnoreCaseAndSurroundingSpacesInTheQuery() {
        #expect(MacCommandPaletteMatcher.score(query: "  PRO ", title: "Progress", group: "Study") == 400)
    }

    @Test func shouldDropEntriesWhoseLettersDoNotAppearInOrder() {
        #expect(MacCommandPaletteMatcher.score(query: "zzz", title: "Progress", group: "Study") == nil)
        #expect(MacCommandPaletteMatcher.score(query: "sgp", title: "Progress", group: "Study") == nil)
    }

    @Test func shouldListTitleMatchesBeforeSectionMatchesForTheSameQuery() {
        let features = [
            feature("tags", "Tags", in: .library),
            feature("library-item", "Library search", in: .manage),
            feature("home", "Home", in: .study)
        ]

        let ids = MacCommandPaletteMatcher.results(query: "lib", in: features).map(\.id)

        #expect(ids == ["library-item", "tags"])
    }

    @Test func shouldKeepSidebarOrderBetweenEntriesWithTheSameScore() {
        let features = [
            feature("b", "Practice B"),
            feature("a", "Practice A"),
            feature("c", "Practice C")
        ]

        #expect(MacCommandPaletteMatcher.results(query: "prac", in: features).map(\.id) == ["b", "a", "c"])
    }

    @Test func shouldFindARealSidebarEntryByTypingTheStartOfItsTitle() throws {
        let target = try #require(MacFeatureRegistry.features.first)
        let prefix = String(target.title.prefix(3))

        let results = MacCommandPaletteMatcher.results(query: prefix, in: MacFeatureRegistry.features)

        #expect(results.contains { $0.id == target.id })
    }

    @Test func shouldReturnNothingWhenNoEntryMatches() {
        let results = MacCommandPaletteMatcher.results(query: "qqqqzzzz", in: MacFeatureRegistry.features)

        #expect(results.isEmpty)
    }
}
