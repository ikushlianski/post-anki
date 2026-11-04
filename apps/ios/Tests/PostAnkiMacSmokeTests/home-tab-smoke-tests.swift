import Testing

extension SmokeTests {
    @Suite("Home tab bar")
    struct HomeTabSmokeTests {
        @Test("should order tabs Triage, Review, Add, Chat, More so the bar never collapses into the system More")
        func tabOrder() {
            #expect(HomeTab.allCases == [.triage, .review, .add, .chat, .more])
            #expect(HomeTab.allCases.count <= 5)
        }
    }
}
