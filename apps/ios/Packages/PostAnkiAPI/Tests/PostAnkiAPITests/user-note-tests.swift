import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Review card user note")
struct UserNoteTests {
    private func card(_ extra: String) throws -> ReviewCard {
        let json = """
        {"variantId":"v1","knowledgeBitId":"kb1","kind":"basic","prompt":"Q","answer":"A","background":null,
        "phase":"new","leech":false,"intervalPreview":{"again":1,"hard":2,"good":3,"easy":4}\(extra)}
        """

        return try JSONDecoder().decode(ReviewCard.self, from: Data(json.utf8))
    }

    @Test("should carry the learner's personal note when the server sends one")
    func withNote() throws {
        #expect(try card(",\"userNote\":\"my trick\"").userNote == "my trick")
    }

    @Test("should have no note when the server sends none")
    func withoutNote() throws {
        #expect(try card("").userNote == nil)
        #expect(try card(",\"userNote\":null").userNote == nil)
    }

    @Test("should cap a personal note at 2000 characters")
    func limit() {
        #expect(UserNote.maxLength == 2000)
    }
}
