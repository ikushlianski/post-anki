import Testing

extension SmokeTests {
    @Suite("Subject kind badge names only the kinds the server sends")
    struct SubjectKindLabelSmokeTests {
        @Test("A subject of the default kind shows no badge")
        func defaultKindHasNoBadge() {
            #expect(SubjectKindLabel.badge(for: "architecture-mentor") == nil)
        }

        @Test("An unknown kind shows the same badge as the default path")
        func unknownKindUsesDefaultPath() {
            #expect(SubjectKindLabel.badge(for: "research-coach") == "Research coach")
        }

        @Test("A language practice subject shows a readable badge")
        func languagePracticeShowsBadge() {
            #expect(SubjectKindLabel.badge(for: "language-practice") == "Language practice")
        }
    }
}
