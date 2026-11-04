import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Chat queue search contract")
    struct ChatQueueSearchTests {
        @Test("should return matching conversation snippets with who said them")
        func decodesResults() async throws {
            let json = #"{"results":[{"cardId":"kb1","seq":3,"role":"assistant","snippet":"...closure..."},{"cardId":"kb2","seq":1,"role":"user","snippet":"why"}]}"#
            RecordingStub.install(body: Data(json.utf8))

            let hits = try await APIClient.searchChatQueue(q: "  closure ")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/knowledge-bits/chat-queue/search")
            #expect(hits.map(\.cardId) == ["kb1", "kb2"])
            #expect(hits.map(\.roleLabel) == ["Tutor", "You"])
            #expect(hits[0].id == "kb1-3")
        }

        @Test("should trim, encode and cap the search term")
        func buildsQuery() {
            #expect(APIClient.chatQueueSearchPath(q: " a b&c ") == "/knowledge-bits/chat-queue/search?q=a%20b%26c")
            #expect(APIClient.chatQueueSearchPath(q: String(repeating: "x", count: 150)).hasSuffix(String(repeating: "x", count: 100)))
            #expect(!APIClient.chatQueueSearchPath(q: String(repeating: "x", count: 150)).contains(String(repeating: "x", count: 101)))
        }

        @Test("should return no hits for an empty result list")
        func decodesEmpty() async throws {
            RecordingStub.install(body: Data(#"{"results":[]}"#.utf8))

            #expect(try await APIClient.searchChatQueue(q: "zz").isEmpty)
        }

        @Test("should flag cut results only when the server says there are more than 20")
        func decodesHasMore() throws {
            let decode = { (json: String) in try JSONDecoder().decode(ChatQueueSearchResponse.self, from: Data(json.utf8)) }

            #expect(try decode(#"{"results":[],"hasMore":true}"#).isCut)
            #expect(try !decode(#"{"results":[],"hasMore":false}"#).isCut)
            #expect(try !decode(#"{"results":[]}"#).isCut)
            #expect(ChatQueueSearchResponse.cutNotice == "Showing the first 20, refine your search")
        }

        @Test("should expose the cut flag through the response call")
        func responseCall() async throws {
            RecordingStub.install(body: Data(#"{"results":[{"cardId":"k","seq":1,"role":"user","snippet":"s"}],"hasMore":true}"#.utf8))

            let response = try await APIClient.searchChatQueueResponse(q: "ab")

            #expect(response.isCut)
            #expect(response.results.count == 1)
        }
    }
}
