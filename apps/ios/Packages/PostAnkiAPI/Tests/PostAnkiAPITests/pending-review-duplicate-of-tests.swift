import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Pending review duplicate flag")
struct PendingReviewDuplicateOfTests {
    private func decode(_ extra: String) throws -> PendingReviewBit {
        let json = #"{"id":"b1","body":"x","origin":"ai","variants":[]\#(extra)}"#

        return try JSONDecoder().decode(PendingReviewBit.self, from: Data(json.utf8))
    }

    @Test("should decode the judge reason and every similar card id of a flagged duplicate")
    func decodesReasonAndSimilarIds() throws {
        let bit = try decode(#","duplicateOf":{"bitId":"s1","front":"Q?","back":"A","similarity":0.93,"reason":"Same fact","similarBitIds":["s1","s2"]}"#)
        let flag = try #require(bit.duplicateOf)

        #expect(flag.reason == "Same fact")
        #expect(flag.similarBitIds == ["s1", "s2"])
        #expect(flag.similarCard.front == "Q?")
        #expect(flag.otherSimilarCount == 1)
    }

    @Test("should still show a flag from an older server that omits reason and similar ids")
    func oldServerFlag() throws {
        let bit = try decode(#","duplicateOf":{"bitId":"s1","front":"Q?","back":null,"similarity":0.9}"#)

        #expect(bit.duplicateOf?.reason == nil)
        #expect(bit.duplicateOf?.similarBitIds.isEmpty == true)
    }

    @Test("should treat a card with a null or missing duplicateOf as not flagged")
    func notFlagged() throws {
        #expect(try decode("").duplicateOf == nil)
        #expect(try decode(#","duplicateOf":null"#).duplicateOf == nil)
    }

    @Test("should keep the duplicate flag when an example is attached")
    func keepsFlagOnExample() throws {
        let bit = try decode(#","duplicateOf":{"bitId":"s1","front":"Q","back":null,"similarity":0.9}"#).withExample("e", aiGeneratedAt: nil)

        #expect(bit.duplicateOf?.bitId == "s1")
    }
}
