import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Triage offers Notion ingest with the removal switch")
    struct TriageNotionIngestSmokeTests {
        private let updated = #"{"id":"ns_01","name":"Phrases","pageUrl":"https://www.notion.so/Phrases-0123456789abcdef0123456789abcdef","subjectId":"sub_01","subjectPath":["English"],"itemsPerRun":20,"frequency":"manual","removeAfterImport":true,"paused":false,"nextRunAt":null,"lastRun":null}"#

        @Test("should label the triage entry and empty-state action Ingest from Notion")
        func entryLabel() {
            #expect(TriageNotionText.entry == "Ingest from Notion")
        }

        @Test("should title the inbox Knowledge Inbox to match the sidebar and share one empty-state phrase")
        func inboxTitleAndEmptyHint() {
            #expect(TriageNotionText.inboxTitle == "Knowledge Inbox")
            #expect(TriageNotionText.emptyHint.contains(TriageNotionText.entry))
            #expect(TriageNotionText.knowledgeEmptyHint.contains(TriageNotionText.entry))
            #expect(TriageNotionText.knowledgeEmptyHint.contains(TriageNotionText.inboxTitle))
        }

        @Test("should send only the removal flag when the user turns removal on from triage")
        func removalToggleSendsOnlyFlag() async throws {
            let session = FakeServerSession([
                "GET /notion-sources": .fixture("notion-sources"),
                "PATCH /notion-sources/ns_01": .json(200, updated)
            ])
            defer { session.end() }

            let model = NotionSourcesModel()

            await model.load()

            let source = try #require(model.sources.first { $0.id == "ns_01" })

            #expect(source.removeAfterImport == false)

            await model.setRemoveAfterImport(source, true)

            #expect(FakeServer.writes.first?.bodyObject as? [String: Bool] == ["removeAfterImport": true])
            #expect(model.sources.first { $0.id == "ns_01" }?.removeAfterImport == true)
        }

        @Test("should not call the server when the removal switch already has that value")
        func removalToggleNoop() async throws {
            let session = FakeServerSession(["GET /notion-sources": .fixture("notion-sources")])
            defer { session.end() }

            let model = NotionSourcesModel()

            await model.load()
            await model.setRemoveAfterImport(model.sources[0], model.sources[0].removeAfterImport)

            #expect(FakeServer.writes.isEmpty)
        }
    }
}
