import Testing

extension SmokeTests {
    @Suite("Subject card count format")
    struct SubjectCardCountFormatSmokeTests {
        @Test("should show a plural count for a subject with several cards")
        func pluralises() {
            #expect(SubjectCardCountFormat.text(12) == "12 cards")
            #expect(SubjectCardCountFormat.text(0) == "0 cards")
        }

        @Test("should say 1 card, singular, for a subject with a single card")
        func singular() {
            #expect(SubjectCardCountFormat.text(1) == "1 card")
        }

        @Test("should show nothing when the server sent no count")
        func nilHides() {
            #expect(SubjectCardCountFormat.text(nil) == nil)
        }
    }
}
