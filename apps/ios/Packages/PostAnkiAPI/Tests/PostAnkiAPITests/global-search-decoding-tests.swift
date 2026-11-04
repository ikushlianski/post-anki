import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Global search decoding")
struct GlobalSearchDecodingTests {
    @Test("should decode grouped search results with the course a topic belongs to")
    func decodesGroupedResults() throws {
        let response = try Fixture.decode(GlobalSearchResponse.self, "global-search")

        #expect(response.subjects.map(\.label) == ["Distributed systems"])
        #expect(response.curricula.map(\.id) == ["cur_01"])
        #expect(response.topics.first?.curriculumId == "cur_01")
        #expect(!response.isEmpty)
    }

    @Test("should report an empty response when nothing matches")
    func emptyResponse() throws {
        let data = Data(#"{"subjects":[],"curricula":[],"topics":[]}"#.utf8)
        let response = try JSONDecoder().decode(GlobalSearchResponse.self, from: data)

        #expect(response.isEmpty)
    }

    @Test("should decode ranked rows with tags, missing course and kind icons")
    func decodesRankedRows() throws {
        let rows = try Fixture.decode([GlobalSearchRankedResult].self, "global-search-ranked")

        #expect(rows.map(\.rowId) == ["topic-top_01", "module-mod_01", "bit-kb_20"])
        #expect(rows[0].tags.map(\.name) == ["patterns"])
        #expect(rows[2].curriculumId == nil)
        #expect(rows.map(\.iconName) == ["book", "square.stack", "text.alignleft"])
    }
}
