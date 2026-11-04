import Testing

extension SmokeTests {
    @Suite("Chat badge and area names")
    struct ChatBadgeAndDomainNamesSmokeTests {
        @Test("should show a question mark instead of a number when the Chat count could not be refreshed")
        func staleBadge() {
            #expect(ChatQueueBadge.text(count: 4, isStale: true) == "?")
            #expect(ChatQueueBadge.text(count: 0, isStale: true) == "?")
        }

        @Test("should show the count when fresh and nothing when the queue is empty")
        func freshBadge() {
            #expect(ChatQueueBadge.text(count: 4, isStale: false) == "4")
            #expect(ChatQueueBadge.text(count: 0, isStale: false) == nil)
        }

        @Test("should tell VoiceOver the count is unavailable when stale")
        func staleLabel() {
            #expect(ChatQueueBadge.accessibilityLabel(count: 4, isStale: true) == "Chat queue, count unavailable")
            #expect(ChatQueueBadge.accessibilityLabel(count: 4, isStale: false) == "Chat queue, 4 waiting")
        }

        @Test("should not call an area removed when the area names failed to load")
        func areaNames() {
            #expect(DomainMappingNames.label(name: "Networking", namesFailed: true) == "Networking")
            #expect(DomainMappingNames.label(name: nil, namesFailed: true) == "(name unavailable)")
            #expect(DomainMappingNames.label(name: nil, namesFailed: false) == "(removed)")
        }
    }
}
