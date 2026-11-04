import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Chat queue Markdown export")
    struct ChatQueueExportTests {
        @Test("should encode the subject id so odd characters cannot change the query")
        func encodesSubjectId() {
            #expect(APIClient.chatQueueExportPath(subjectId: "a&b=c d") == "/knowledge-bits/chat-queue/export?subjectId=a%26b%3Dc%20d")
        }

        @Test("should name the file from the server header and fall back when it is missing or unsafe")
        func namesFile() {
            #expect(APIClient.exportFilename(header: #"attachment; filename="chat-swift.md""#, fallback: "x.md") == "chat-swift.md")
            #expect(APIClient.exportFilename(header: "attachment; filename=chat-go.md; size=3", fallback: "x.md") == "chat-go.md")
            #expect(APIClient.exportFilename(header: #"attachment; filename="../evil.md""#, fallback: "x.md") == "x.md")
            #expect(APIClient.exportFilename(header: nil, fallback: "x.md") == "x.md")
            #expect(APIClient.exportFilename(header: #"attachment; filename="""#, fallback: "x.md") == "x.md")
        }

        @Test("should return the Markdown text as-is from the export route")
        func fetchesMarkdown() async throws {
            RecordingStub.install(body: Data("# Chat\n\n> hi".utf8))

            let file = try await APIClient.exportChatQueueMarkdown(subjectId: "s1", fallbackName: "chat-swift.md")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/knowledge-bits/chat-queue/export")
            #expect(file.markdown == "# Chat\n\n> hi")
            #expect(file.filename == "chat-swift.md")
        }

        @Test("should map an unknown subject to the not-found chat failure")
        func mapsNotFound() async {
            RecordingStub.install(status: 404, body: Data(#"{"error":"not_found"}"#.utf8))

            do {
                _ = try await APIClient.exportChatQueueMarkdown(subjectId: "gone")
                Issue.record("expected failure")
            } catch {
                #expect(ChatQueueFailure.failure(for: error) == .notFound)
            }
        }

        @Test("should read subjectId from a chat item and treat it as absent when missing or malformed")
        func decodesSubjectId() throws {
            func item(_ extra: String) throws -> ChatQueueItem {
                let json = Data(#"{"id":"a","body":"b","origin":"manual","chatAt":"t","turnsLeft":1\#(extra)}"#.utf8)

                return try JSONDecoder().decode(ChatQueueItem.self, from: json)
            }

            #expect(try item(#","subjectId":"s1""#).subjectId == "s1")
            #expect(try item("").subjectId == nil)
            #expect(try item(#","subjectId":null"#).subjectId == nil)
            #expect(try item(#","subjectId":5"#).subjectId == nil)
        }
    }
}
