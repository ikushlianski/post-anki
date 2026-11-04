import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Triage shows flagged duplicates")
    struct TriageDuplicateSmokeTests {
        private let flagged = #"{"id":"dup","body":"b","background":null,"origin":"extracted","variants":[{"id":"v","kind":"basic","prompt":"p","answer":"a"}],"duplicateOf":{"bitId":"old","front":"Old front","back":"Old back","similarity":0.95,"reason":"Same fact","similarBitIds":["old","older"]}}"#

        @Test("should keep a flagged duplicate in the triage queue with its judge reason and similar card")
        func flaggedCardStaysInQueue() throws {
            let sources = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [flagged, FocusTriageFixtures.bit("b")])])
            let queue = FocusTriageQueue.build(sources: sources, pinnedBitId: nil)
            let duplicate = try #require(queue.current?.duplicateOf)

            #expect(queue.current?.id == "dup")
            #expect(duplicate.reason == "Same fact")
            #expect(duplicate.similarCard.front == "Old front")
            #expect(duplicate.otherSimilarCount == 1)
        }

        @Test("should flag only the card the server marked as a duplicate")
        func unflaggedCardHasNoBadge() throws {
            let sources = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [FocusTriageFixtures.bit("b")])])

            #expect(sources[0].bits[0].duplicateOf == nil)
        }
    }
}
