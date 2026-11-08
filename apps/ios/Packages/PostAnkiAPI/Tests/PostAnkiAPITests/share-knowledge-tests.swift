import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Share extension save")
    struct ShareKnowledgeContractTests {
        @Test("should send no subject when Auto is chosen so the server sorts it")
        func autoSendsNoSubject() async throws {
            RecordingStub.install(body: Data(#"{"id":"src_1"}"#.utf8))

            let draft = try ShareKnowledgeDraft(text: "  Selected words  ", subjectId: ShareSubjectOption.auto.id)
            try await APIClient.saveSharedText(draft)
            let request = try #require(RecordingStub.last)

            #expect(request.path == "/knowledge-sources")
            #expect(request.body?["text"] as? String == "Selected words")
            #expect(request.body?["subjectId"] == nil)
        }

        @Test("should send the chosen subject when the user picks one")
        func chosenSubject() async throws {
            RecordingStub.install(body: Data(#"{"id":"src_2"}"#.utf8))

            try await APIClient.saveSharedText(try ShareKnowledgeDraft(text: "Words", subjectId: "subj_9"))

            #expect(RecordingStub.last?.body?["subjectId"] as? String == "subj_9")
        }
    }
}

@Suite("Share extension text and subject rules")
struct ShareKnowledgeTests {
    @Test("should refuse blank selections instead of saving nothing")
    func blankRefused() {
        #expect(throws: ShareKnowledgeError.empty) { try ShareKnowledgeDraft(text: " \n ", subjectId: nil) }
    }

    @Test("should refuse text over the server limit with a clear reason")
    func tooLong() {
        let text = String(repeating: "a", count: ShareKnowledgeDraft.maxCharacters + 1)

        #expect(throws: ShareKnowledgeError.tooLong) { try ShareKnowledgeDraft(text: text, subjectId: nil) }
    }

    @Test("should offer Auto first and then subjects by full path")
    func optionsOrder() {
        let subjects = [
            Subject(id: "b", name: "Swift", description: nil, parentId: "a"),
            Subject(id: "a", name: "Programming", description: nil, parentId: nil),
            Subject(id: "c", name: "Cooking", description: nil, parentId: nil)
        ]
        let options = ShareSubjectOptions.options(from: subjects)

        #expect(options.map(\.label) == ["Auto", "Cooking", "Programming", "Programming > Swift"])
        #expect(options.first?.id == nil)
    }

    @Test("should not loop forever on subjects that point at each other")
    func cyclicParents() {
        let subjects = [
            Subject(id: "a", name: "A", description: nil, parentId: "b"),
            Subject(id: "b", name: "B", description: nil, parentId: "a")
        ]

        #expect(ShareSubjectOptions.options(from: subjects).count == 3)
    }

    @Test("should tell the user in plain words when they are signed out, offline or the text is too long")
    func plainMessages() {
        #expect(ShareKnowledgeMessage.failure(for: APIError.unauthorized) == ShareKnowledgeMessage.signedOut)
        #expect(ShareKnowledgeMessage.failure(for: URLError(.notConnectedToInternet)) == ShareKnowledgeMessage.offline)
        #expect(ShareKnowledgeMessage.failure(for: APIError.badStatus(400, "source_too_long")) == ShareKnowledgeMessage.tooLong)
        #expect(ShareKnowledgeMessage.failure(for: APIError.badStatus(500, nil)) == ShareKnowledgeMessage.other)
    }

    @Test("should say the item will be sorted automatically only when no subject was chosen")
    func successWording() {
        #expect(ShareKnowledgeMessage.success(subjectId: nil) == ShareKnowledgeMessage.saved)
        #expect(ShareKnowledgeMessage.success(subjectId: "x") == ShareKnowledgeMessage.savedToSubject)
    }
}
