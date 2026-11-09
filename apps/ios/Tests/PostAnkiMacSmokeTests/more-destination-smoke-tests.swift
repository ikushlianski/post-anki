import Testing

extension SmokeTests {
    @Suite("More menu destinations")
    struct MoreDestinationSmokeTests {
        @Test("should list every reachable screen in order without course wording")
        func listsScreensInOrder() {
            let titles = MoreDestination.allCases.map(\.title)

            #expect(titles == [
                "Knowledge", "Subjects", "Notes", "Search", "Tags", "Duplicates",
                "Today", "Progress", "Statistics", "Learning list", "Study sessions", "Triage history", "Study plan",
                "Settings", "Account", "About"
            ])
            #expect(!titles.contains("More"))
            #expect(!titles.contains { $0.localizedCaseInsensitiveContains("course") })
        }

        @Test("should group every destination into exactly one section")
        func groupsEveryDestinationOnce() {
            let grouped = MoreSection.allCases.flatMap(\.destinations)

            #expect(grouped == MoreDestination.allCases)
            #expect(MoreSection.allCases.map(\.title) == ["Library", "Study", "Account"])
        }

        @Test("should give every destination an icon")
        func everyDestinationHasIcon() {
            #expect(MoreDestination.allCases.allSatisfy { !$0.systemImage.isEmpty })
        }
    }
}
