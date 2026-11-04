import Testing

extension SmokeTests {
    @Suite("Knowledge item detail keeps a readable width")
    struct KnowledgeItemDetailLayoutSmokeTests {
        @Test("should cap the detail content at 760 points so Status and Subject values stay next to their labels on a wide window")
        func capsWideWindows() {
            #expect(KnowledgeItemDetailLayout.contentWidth(available: 1600) == 760)
        }

        @Test("should use the whole width on a window narrower than the cap")
        func narrowWindowUsesAllWidth() {
            #expect(KnowledgeItemDetailLayout.contentWidth(available: 500) == 500)
        }
    }
}
