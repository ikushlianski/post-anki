import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Server contract")
struct ServerContractTests {
    @Test("should send gapId as an explicit null when a probe answer has no gap")
    func probeAnswerKeepsNullGapId() throws {
        let input = TopicProbeAnswerInput(gapId: nil, answer: "because")
        let json = try #require(String(data: JSONEncoder().encode(input), encoding: .utf8))

        #expect(json.contains("\"gapId\":null"))
        #expect(!json.contains("selfOutcome"))
    }

    @Test("should send gapId and self outcome when a probe answer has them")
    func probeAnswerSendsGapId() throws {
        let input = TopicProbeAnswerInput(gapId: "gap_1", answer: "x", selfOutcome: "covered")
        let object = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: String])

        #expect(object["gapId"] == "gap_1")
        #expect(object["mode"] == "socratic")
        #expect(object["selfOutcome"] == "covered")
    }

    @Test("should label web research sources with the server's web_research kind")
    func labelsWebResearchKind() throws {
        let json = #"{"id":"s1","curriculumId":"c","curriculumName":"C","subjectId":"j","subjectName":"J","kind":"web_research","value":"v","title":null,"fetchState":"fetched","lastFetchedAt":null,"lastFetchOutcome":null,"createdAt":"2026-10-23T08:00:00.000Z"}"#
        let item = try JSONDecoder().decode(SourceLibraryItem.self, from: Data(json.utf8))

        #expect(item.kindLabel == "Web research")
    }
}
