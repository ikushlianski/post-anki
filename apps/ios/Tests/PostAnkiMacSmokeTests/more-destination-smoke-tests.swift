import Testing

extension SmokeTests {
    @Suite("More menu destinations")
    struct MoreDestinationSmokeTests {
        @Test("should list every reachable screen in order without course wording")
        func listsScreensInOrder() {
            let titles = MoreDestination.allCases.map(\.title)

            #expect(titles == [
                "Today", "Progress", "Learning list", "Study sessions", "Notes",
                "Search", "Tags", "Duplicates", "Settings"
            ])
            #expect(!titles.contains { $0.localizedCaseInsensitiveContains("course") })
        }

        @Test("should give every destination an icon")
        func everyDestinationHasIcon() {
            #expect(MoreDestination.allCases.allSatisfy { !$0.systemImage.isEmpty })
        }
    }
}
