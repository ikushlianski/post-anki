import Foundation
import PostAnkiAPI
import Testing

@testable import PostAnkiMac

@Suite("Mac knowledge list shows a dash for cards with no due date")
struct MacKnowledgeDuePlaceholderTests {
    @Test("should show a dash instead of blank text when a card has no due date")
    func unscheduledCardShowsDash() throws {
        let json = #"{"knowledgeBitId":"k1","question":"Q","answer":"A","subjectId":null,"state":"new","dueAt":null,"lapses":0}"#
        let item = try JSONDecoder().decode(KnowledgeOverviewItem.self, from: Data(json.utf8))
        let row = MacKnowledgeTableRow(item: item, subjectName: "")

        #expect(row.dueText == "-")
        #expect(row.dueKey == "")
    }
}
