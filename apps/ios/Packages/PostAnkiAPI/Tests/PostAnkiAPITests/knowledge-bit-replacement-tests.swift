import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Replacement card contract")
    struct KnowledgeBitReplacementTests {
        private func entries(_ count: Int) -> [ChatTranscriptEntry] {
            (0..<count).map { ChatTranscriptEntry(role: $0 % 2 == 0 ? "user" : "assistant", text: "m\($0)") }
        }

        @Test("should draft in create mode with only the last 20 messages and no web search")
        func draftRequest() async throws {
            RecordingStub.install(body: Data(#"{"sources":[],"card":{"front":"F","back":"B","sources":[],"usedWebSearch":false}}"#.utf8))

            let card = try await APIClient.draftReplacementCard(id: "kb 1", transcript: entries(25))
            let request = try #require(RecordingStub.last)
            let sent = try #require(request.body?["transcript"] as? [[String: Any]])

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb%201/chat/draft")
            #expect(request.body?["mode"] as? String == "create")
            #expect(request.body?["allowWebSearch"] as? Bool == false)
            #expect(request.body?["instruction"] as? String == KnowledgeBitReplacement.instruction)
            #expect(sent.count == 20)
            #expect(sent.first?["text"] as? String == "m5")
            #expect(card.front == "F")
            #expect(card.example == nil)
        }

        @Test("should save a trimmed card and drop sources unless web search was used")
        func createRequest() async throws {
            RecordingStub.install(body: Data(#"{"id":"kb_2"}"#.utf8))

            let card = CardProposal(front: " F ", back: " B ", example: "  ", sources: ["https://a.com"], usedWebSearch: false)
            let result = try await APIClient.createDerivedItem(id: "kb_1", card: card)
            let request = try #require(RecordingStub.last)

            #expect(request.path == "/knowledge-bits/kb_1/derived-items")
            #expect(request.body?["front"] as? String == "F")
            #expect(request.body?["back"] as? String == "B")
            #expect(request.body?["example"] == nil)
            #expect(request.body?["aiGenerated"] as? Bool == false)
            #expect((request.body?["sourceLinks"] as? [String]) == [])
            #expect(result.id == "kb_2")
        }

        @Test("should keep sources and flag AI when web search was used")
        func createWithSources() async throws {
            RecordingStub.install(body: Data(#"{"id":"kb_3"}"#.utf8))

            let card = CardProposal(front: "F", back: "B", example: " E ", sources: ["https://a.com"], usedWebSearch: true)
            _ = try await APIClient.createDerivedItem(id: "kb_1", card: card)
            let request = try #require(RecordingStub.last)

            #expect(request.body?["example"] as? String == "E")
            #expect(request.body?["aiGenerated"] as? Bool == true)
            #expect((request.body?["sourceLinks"] as? [String]) == ["https://a.com"])
        }
    }
}
