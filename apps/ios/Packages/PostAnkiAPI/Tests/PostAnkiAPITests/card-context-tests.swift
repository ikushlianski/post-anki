import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Card context field")
struct CardContextTests {
    private func variant(_ fields: String) throws -> PendingReviewVariant {
        let json = #"{"id": "v1", "kind": "basic", \#(fields)"answer": "a"}"#

        return try JSONDecoder().decode(PendingReviewVariant.self, from: Data(json.utf8))
    }

    @Test("should show the situation above the question when the server sends a context")
    func usesServerContext() throws {
        let item = try variant(#""context": "senior dev talking to their manager", "prompt": "How do you say no politely?","#)

        #expect(item.face == CardFace(context: "senior dev talking to their manager", front: "How do you say no politely?"))
    }

    @Test("should still decode an old variant that has no context key")
    func decodesWithoutContext() throws {
        let item = try variant(#""prompt": "Just a question","#)

        #expect(item.context == nil)
        #expect(item.face == CardFace(context: nil, front: "Just a question"))
    }

    @Test("should read an old two-line prompt as question first and situation second, for display only")
    func splitsTwoLinePrompt() {
        let face = CardFace.make(context: nil, prompt: "How do you say no politely?\nsenior dev talking to a manager")

        #expect(face == CardFace(context: "senior dev talking to a manager", front: "How do you say no politely?"))
    }

    @Test("should leave a prompt alone when it is not exactly two lines")
    func keepsOtherPrompts() {
        #expect(CardFace.make(context: nil, prompt: "One line").context == nil)
        #expect(CardFace.make(context: nil, prompt: "a\nb\nc") == CardFace(context: nil, front: "a\nb\nc"))
    }

    @Test("should hide an empty context and not split the prompt when a context key is present")
    func emptyContextHidden() {
        #expect(CardFace.make(context: "  ", prompt: "a\nb") == CardFace(context: nil, front: "a\nb"))
    }

    @Test("should leave the context key out when it was not loaded so the server keeps it")
    func omitsUnloadedContext() throws {
        let data = try JSONEncoder().encode(EditVariantInput(context: nil, prompt: "q", answer: "a"))
        let text = String(decoding: data, as: UTF8.self)

        #expect(!text.contains("context"))
    }

    @Test("should send an explicitly cleared context as an empty string so the server removes it")
    func encodesClearedContext() throws {
        let data = try JSONEncoder().encode(EditVariantInput(context: "", prompt: "q", answer: "a"))
        let text = String(decoding: data, as: UTF8.self)

        #expect(text.contains(#""context":"""#))
    }
}
