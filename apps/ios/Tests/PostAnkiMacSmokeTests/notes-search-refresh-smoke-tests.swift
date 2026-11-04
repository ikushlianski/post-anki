import Testing

extension SmokeTests {
    @Suite("Notes search refresh")
    struct NotesSearchRefreshSmokeTests {
        @MainActor
        @Test("should leave an empty search untouched when pulled to refresh")
        func emptyQueryRefreshIsNoOp() async {
            let model = NotesSearchModel()

            await model.refresh()

            #expect(model.results.isEmpty)
            #expect(!model.hasSearched)
            #expect(model.errorMessage == nil)
        }
    }
}
