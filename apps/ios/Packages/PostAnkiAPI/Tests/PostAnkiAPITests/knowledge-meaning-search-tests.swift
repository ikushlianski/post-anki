import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Knowledge meaning search")
struct KnowledgeMeaningSearchTests {
    @Test("should decode matches with a plain origin label, percent and coverage counts")
    func decodesMatches() throws {
        let result = try Fixture.decode(KnowledgeMeaningMatches.self, "knowledge-meaning-matches")

        #expect(result.items.map(\.question) == ["What is a saga?", "Define CAP."])
        #expect(result.items.map(\.matchPercent) == [83, 41])
        #expect(result.items.map(\.originLabel) == ["Notion", "Found by AI on the web"])
        #expect(result.notReadyCount == 3)
        #expect(!result.capped)
    }

    @Test("should explain rate limiting and embedding failures in plain language")
    func explainsServerRefusals() {
        #expect(KnowledgeMeaningSearchError.message(for: APIError.badStatus(429, "search_rate_limited")).contains("minute"))
        #expect(KnowledgeMeaningSearchError.message(for: APIError.badStatus(502, "embedding_failed")).contains("unavailable"))
    }
}

@Suite("Knowledge list filter requests")
struct KnowledgeFilterRequestTests {
    @Test("should leave state and origin out of the overview URL when no filter is chosen")
    func omitsEmptyFilters() {
        let path = APIClient.knowledgeOverviewPath(subjectId: nil, q: nil, limit: 50, offset: 0, states: [], origins: [])

        #expect(path == "/knowledge-bits/overview?limit=50&offset=0")
    }

    @Test("should send chosen states and origins as comma separated lists next to subject and text")
    func sendsFilters() {
        let path = APIClient.knowledgeOverviewPath(
            subjectId: "sub_1",
            q: "saga",
            limit: 50,
            offset: 50,
            states: ["learning", "relearning"],
            origins: ["notion", "ai_web"]
        )

        #expect(path == "/knowledge-bits/overview?limit=50&offset=50&subjectId=sub_1&q=saga&states=learning%2Crelearning&origins=notion%2Cai_web")
    }

    @Test("should carry the same state and origin filters on the search by meaning request")
    func meaningCarriesFilters() {
        let path = APIClient.knowledgeMeaningMatchesPath(q: "retry", subjectId: nil, states: ["new"], origins: ["manual"])

        #expect(path == "/knowledge-bits/browser/matches?q=retry&states=new&origins=manual")
    }

    @Test("should not add filters to the meaning request when none are chosen")
    func meaningWithoutFilters() {
        let path = APIClient.knowledgeMeaningMatchesPath(q: "retry", subjectId: "s", states: [], origins: [])

        #expect(path == "/knowledge-bits/browser/matches?q=retry&subjectId=s")
    }
}
