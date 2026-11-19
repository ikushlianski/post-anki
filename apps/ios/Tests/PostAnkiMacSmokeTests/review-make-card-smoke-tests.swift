import Foundation
import Testing
@testable import PostAnkiAPI

extension SmokeTests {
    @Suite("Making a card from a highlighted answer")
    struct ReviewMakeCardSmokeTests {
        @Test("should pre-fill the answer with the highlighted part and send it for the current card")
        func createsFromHighlight() async {
            let text = "A function that remembers its scope. It keeps outer variables alive."
            let range = (text as NSString).range(of: "It keeps outer variables alive.")
            let back = ReviewMakeCard.selectedText(in: text, range: range)
            var sent: [String] = []
            let outcome = await ReviewMakeCard.submit(bitId: "kb1", front: "What stays alive?", back: back, canReachServer: true) { sent = [$0, $1, $2] }

            #expect(outcome == .created)
            #expect(sent == ["kb1", "What stays alive?", "It keeps outer variables alive."])
        }

        @Test("should say a connection is needed and send nothing when offline")
        func offline() async {
            var called = false
            let outcome = await ReviewMakeCard.submit(bitId: "kb1", front: "Q", back: "A", canReachServer: false) { _, _, _ in called = true }

            #expect(outcome == .offline)
            #expect(!called)
        }
    }
}
