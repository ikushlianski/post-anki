import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Notion ingestion source contract")
struct NotionSourceDecodingTests {
    @Test("should decode a nightly source with its last run and a paused manual source with none")
    func decodesSources() throws {
        let response = try Fixture.decode(NotionSourcesResponse.self, "notion-sources")
        let first = try #require(response.sources.first)
        let second = try #require(response.sources.last)

        #expect(first.subjectPath == ["English", "English for IT"])
        #expect(first.frequency == .nightly)
        #expect(first.removeAfterImport == false)
        #expect(first.lastRun?.status == .ok)
        #expect(first.lastRun?.imported == 4)
        #expect(second.paused)
        #expect(second.removeAfterImport)
        #expect(second.nextRunAt == nil)
        #expect(second.lastRun == nil)
    }

    @Test("should decode every run status the server can return, including a skipped run")
    func decodesRunStatuses() throws {
        for (raw, expected) in [
            ("running", NotionRunStatus.running), ("ok", .ok), ("partial", .partial), ("failed", .failed),
            ("skipped_budget", .skippedBudget), ("skipped_no_connection", .skippedNoConnection)
        ] {
            let json = #"{"status":"\#(raw)","read":0,"imported":0,"skippedExisting":0,"ignored":0,"removed":0,"removeFailed":0}"#
            let result = try JSONDecoder().decode(NotionRunResult.self, from: Data(json.utf8))

            #expect(result.status == expected)
        }
    }

    @Test("should decode a partial run result with every count")
    func decodesRunResult() throws {
        let result = try Fixture.decode(NotionRunResult.self, "notion-run-result")

        #expect(result.status == .partial)
        #expect(result.read == 12)
        #expect(result.imported == 5)
        #expect(result.skippedExisting == 4)
        #expect(result.ignored == 1)
        #expect(result.removed == 4)
        #expect(result.removeFailed == 1)
    }

    @Test("should decode the connection state without any token field")
    func decodesConnection() throws {
        let status = try Fixture.decode(NotionConnectionStatus.self, "notion-connection")
        let mirror = Mirror(reflecting: status).children.compactMap(\.label)

        #expect(status.configured)
        #expect(status.origin == .env)
        #expect(!status.canStoreToken)
        #expect(!mirror.contains { $0.localizedCaseInsensitiveContains("token") && $0 != "canStoreToken" })
    }

    @Test("should decode a connection check with and without a workspace name")
    func decodesCheck() throws {
        let named = try JSONDecoder().decode(NotionConnectionCheck.self, from: Data(#"{"ok":true,"workspaceName":"Acme"}"#.utf8))
        let unnamed = try JSONDecoder().decode(NotionConnectionCheck.self, from: Data(#"{"ok":false,"workspaceName":null}"#.utf8))

        #expect(named.workspaceName == "Acme")
        #expect(!unnamed.ok)
        #expect(unnamed.workspaceName == nil)
    }

    @Test("should send removeAfterImport explicitly when creating a source")
    func encodesRemovalFlag() throws {
        let input = NotionSourceInput(
            name: "n", pageUrl: "https://www.notion.so/p-0123456789abcdef0123456789abcdef",
            subjectId: "s", itemsPerRun: 20, frequency: .manual, removeAfterImport: false
        )
        let object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any])

        #expect(object["removeAfterImport"] as? Bool == false)
    }

    @Test("should send only the paused flag when pausing a source")
    func encodesPauseOnly() throws {
        let data = try JSONEncoder().encode(NotionSourceUpdate(paused: true))
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Bool])

        #expect(object == ["paused": true])
    }

    @Test("should accept Notion page links and reject other hosts, http and links without an id")
    func validatesLinks() {
        let id = "0123456789abcdef0123456789abcdef"

        #expect(NotionPageLink.isValid("https://www.notion.so/Phrases-\(id)"))
        #expect(NotionPageLink.isValid("https://notion.so/\(id)"))
        #expect(NotionPageLink.isValid("https://team.notion.site/Page-\(id)"))
        #expect(!NotionPageLink.isValid("http://www.notion.so/\(id)"))
        #expect(!NotionPageLink.isValid("https://notion.so.evil.com/\(id)"))
        #expect(!NotionPageLink.isValid("https://www.notion.so/no-id-here"))
    }
}
