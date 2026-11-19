import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Review make card from selection")
struct ReviewMakeCardTests {
    private struct Boom: Error {}

    @Test("should pre-fill the answer with exactly the highlighted part, trimmed")
    func selection() {
        let text = "A function that remembers its scope. It keeps outer variables alive."
        let range = (text as NSString).range(of: " It keeps outer variables alive.")

        #expect(ReviewMakeCard.selectedText(in: text, range: range) == "It keeps outer variables alive.")
    }

    @Test("should give an empty answer when nothing is highlighted")
    func noSelection() {
        #expect(ReviewMakeCard.selectedText(in: "abc", range: NSRange(location: 1, length: 0)).isEmpty)
    }

    @Test("should cap a long highlight at the answer limit")
    func cap() {
        let text = String(repeating: "a", count: 900)

        #expect(ReviewMakeCard.selectedText(in: text, range: NSRange(location: 0, length: 900)).count == ReviewMakeCard.backMaxLength)
    }

    @Test("should send the typed question and highlighted answer for the current card")
    func createSucceeds() async {
        var sent: [String] = []
        let outcome = await ReviewMakeCard.submit(bitId: "kb1", front: " Q? ", back: "A", canReachServer: true) { bit, front, back in
            sent = [bit, front, back]
        }

        #expect(outcome == .created)
        #expect(sent == ["kb1", "Q?", "A"])
    }

    @Test("should show a retry message when the server call fails")
    func createFails() async {
        let outcome = await ReviewMakeCard.submit(bitId: "kb1", front: "Q", back: "A", canReachServer: true) { _, _, _ in throw Boom() }

        #expect(outcome == .failed(ReviewMakeCard.failureMessage))
    }

    @Test("should say a connection is needed offline and send nothing")
    func offline() async {
        var called = false
        let outcome = await ReviewMakeCard.submit(bitId: "kb1", front: "Q", back: "A", canReachServer: false) { _, _, _ in called = true }

        #expect(outcome == .offline)
        #expect(!called)
    }

    @Test("should report offline when the connection drops during the call")
    func dropsMidCall() async {
        let outcome = await ReviewMakeCard.submit(bitId: "kb1", front: "Q", back: "A", canReachServer: true) { _, _, _ in throw URLError(.notConnectedToInternet) }

        #expect(outcome == .offline)
    }

    @Test("should not allow creating without a question or answer")
    func needsBoth() {
        #expect(!ReviewMakeCard.canCreate(front: " ", back: "A"))
        #expect(!ReviewMakeCard.canCreate(front: "Q", back: ""))
        #expect(ReviewMakeCard.canCreate(front: "Q", back: "A"))
    }
}
