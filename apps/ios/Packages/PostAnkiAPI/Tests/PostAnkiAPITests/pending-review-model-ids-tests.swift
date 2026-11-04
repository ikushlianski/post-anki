import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Pending review model ids")
struct PendingReviewModelIdsTests {
    private func decode(_ extra: String) throws -> PendingReviewBit {
        let json = #"{"id":"b1","body":"x","origin":"ai","variants":[]\#(extra)}"#

        return try JSONDecoder().decode(PendingReviewBit.self, from: Data(json.utf8))
    }

    @Test("should decode the models that produced a fused card")
    func decodesModelIds() throws {
        let bit = try decode(#","modelIds":["anthropic/claude-haiku-5.5","openai/gpt-5"]"#)

        #expect(bit.modelIds == ["anthropic/claude-haiku-5.5", "openai/gpt-5"])
    }

    @Test("should treat a card without modelIds as a non-fusion card")
    func missingModelIds() throws {
        #expect(try decode("").modelIds.isEmpty)
    }

    @Test("should keep model ids when an example is attached")
    func keepsModelIdsOnExample() throws {
        let bit = try decode(#","modelIds":["a/b"]"#).withExample("e", aiGeneratedAt: nil)

        #expect(bit.modelIds == ["a/b"])
    }
}
