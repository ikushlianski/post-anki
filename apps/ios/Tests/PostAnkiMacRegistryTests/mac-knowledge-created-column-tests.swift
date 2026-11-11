import Foundation
import PostAnkiAPI
import Testing

@testable import PostAnkiMac

@Suite("Mac knowledge list shows when each card was created")
struct MacKnowledgeCreatedColumnTests {
    private func row(createdAt: String?) throws -> MacKnowledgeTableRow {
        let created = createdAt.map { #","createdAt":"\#($0)""# } ?? ""
        let json = #"{"knowledgeBitId":"k1","question":"Q","answer":"A","subjectId":null,"state":"new","dueAt":null,"lapses":0\#(created)}"#
        let item = try JSONDecoder().decode(KnowledgeOverviewItem.self, from: Data(json.utf8))

        return MacKnowledgeTableRow(item: item, subjectName: "")
    }

    @Test("should show a local date and time and sort chronologically by the raw timestamp")
    func showsDateTime() throws {
        let older = try row(createdAt: "2026-03-04T12:00:00.000Z")
        let newer = try row(createdAt: "2026-03-05T09:30:00.000Z")

        #expect(older.createdText != "-")
        #expect(older.createdKey < newer.createdKey)
    }

    @Test("should show a dash when the server sends no creation time")
    func showsDash() throws {
        #expect(try row(createdAt: nil).createdText == "-")
    }
}
