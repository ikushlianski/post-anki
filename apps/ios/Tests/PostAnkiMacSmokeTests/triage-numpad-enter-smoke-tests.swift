import Testing

extension SmokeTests {
    @Suite("Triage numpad Enter")
    struct TriageNumpadEnterSmokeTests {
        @Test("should treat numpad Enter like Return and keep the card")
        func numpadEnterKeeps() {
            let input = PendingReviewTriageKeyInput(keyboardInput: "\u{3}")

            #expect(input == .returnKey)
            #expect(input.flatMap { PendingReviewTriageKeyMap.action(for: $0) } == .keep)
        }
    }
}
