import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Add knowledge source contract")
    struct KnowledgeSourceAddContractTests {
        @Test("should send pasted text with a subject and no force")
        func sendsText() async throws {
            RecordingStub.install(body: Data(#"{"id":"src_1"}"#.utf8))

            let result = try await APIClient.addKnowledgeSource(content: .text("Idempotency keys"), subjectId: "subj_1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-sources")
            #expect(request.body?["text"] as? String == "Idempotency keys")
            #expect(request.body?["subjectId"] as? String == "subj_1")
            #expect(request.body?["url"] == nil)
            #expect(request.body?["force"] == nil)
            #expect(result.id == "src_1")
        }

        @Test("should send a link as url and never as text")
        func sendsLink() async throws {
            RecordingStub.install(body: Data(#"{"id":"src_2"}"#.utf8))

            _ = try await APIClient.addKnowledgeSource(content: .url("https://example.com/a"))
            let request = try #require(RecordingStub.last)

            #expect(request.body?["url"] as? String == "https://example.com/a")
            #expect(request.body?["text"] == nil)
            #expect(request.body?["subjectId"] == nil)
        }

        @Test("should resend with force true when the user adds a duplicate anyway")
        func sendsForce() async throws {
            RecordingStub.install(body: Data(#"{"id":"src_3"}"#.utf8))

            _ = try await APIClient.addKnowledgeSource(content: .text("Again"), force: true)

            #expect(RecordingStub.last?.body?["force"] as? Bool == true)
        }

        @Test("should map a 409 already_added reply from the server to its refusal")
        func mapsServerRefusal() async throws {
            RecordingStub.install(status: 409, body: Data(#"{"error":"already_added"}"#.utf8))

            do {
                _ = try await APIClient.addKnowledgeSource(content: .text("Again"))
                Issue.record("expected failure")
            } catch {
                #expect(KnowledgeSourceRefusal.from(error) == .alreadyAdded)
            }
        }
    }
}

@Suite("Knowledge source refusal")
struct KnowledgeSourceRefusalTests {
    @Test("should give each refusal code the same sentence the web shows")
    func webSentences() {
        let expected: [(String, KnowledgeSourceRefusal, String)] = [
            ("fetch_failed", .fetchFailed, "That page could not be opened."),
            ("empty_content", .emptyContent, "That page has no readable text."),
            ("subject_not_found", .subjectNotFound, "The chosen subject no longer exists. Pick another subject."),
            ("subject_has_children", .subjectHasChildren, "This subject has sub-subjects. Choose one of them."),
            ("already_added", .alreadyAdded, "This was already added."),
            ("text_too_long", .textTooLong, "This text is longer than 50,000 characters. Split it into smaller blocks.")
        ]

        for (code, refusal, sentence) in expected {
            let mapped = KnowledgeSourceRefusal.from(APIError.badStatus(422, code))

            #expect(mapped == refusal)
            #expect(mapped?.message == sentence)
        }
    }

    @Test("should return nothing for unknown codes, missing codes and non-API errors")
    func unknownIsNil() {
        #expect(KnowledgeSourceRefusal.from(APIError.badStatus(500, "boom")) == nil)
        #expect(KnowledgeSourceRefusal.from(APIError.badStatus(400, nil)) == nil)
        #expect(KnowledgeSourceRefusal.from(APIError.unauthorized) == nil)
        #expect(KnowledgeSourceRefusal.from(URLError(.notConnectedToInternet)) == nil)
    }

    @Test("should only offer Add anyway for an already added source")
    func onlyDuplicatesCanBeForced() {
        #expect(KnowledgeSourceRefusal.alreadyAdded.canForce)
        #expect(!KnowledgeSourceRefusal.textTooLong.canForce)
        #expect(!KnowledgeSourceRefusal.fetchFailed.canForce)
    }
}

@Suite("Pending source subject")
struct PendingSourceSubjectTests {
    private let bit = #"{"id":"kb","body":"b","background":null,"origin":"extracted","variants":[]}"#

    @Test("should read the subject id of a pending source when the server sends it")
    func decodesSubjectId() throws {
        let json = #"{"knowledgeSourceId":"s1","sourceText":null,"subjectId":"subj_1","subjectName":"Finance","bits":["# + bit + #"]}"#
        let source = try JSONDecoder().decode(PendingReviewSource.self, from: Data(json.utf8))

        #expect(source.subjectId == "subj_1")
    }

    @Test("should leave the subject id empty when the server omits or nulls it")
    func decodesMissingSubjectId() throws {
        let omitted = #"{"knowledgeSourceId":"s1","sourceText":null,"subjectName":null,"bits":[]}"#
        let nulled = #"{"knowledgeSourceId":"s1","sourceText":null,"subjectId":null,"subjectName":null,"bits":[]}"#

        #expect(try JSONDecoder().decode(PendingReviewSource.self, from: Data(omitted.utf8)).subjectId == nil)
        #expect(try JSONDecoder().decode(PendingReviewSource.self, from: Data(nulled.utf8)).subjectId == nil)
    }

    @Test("should keep the subject id when a source is rebuilt with fewer cards")
    func withBitsKeepsSubjectId() {
        let source = PendingReviewSource(knowledgeSourceId: "s1", sourceText: nil, subjectName: "Finance", bits: [], subjectId: "subj_1")

        #expect(source.withBits([]).subjectId == "subj_1")
    }

    @Test("should still build a source without passing a subject id")
    func defaultedInit() {
        #expect(PendingReviewSource(knowledgeSourceId: "s1", sourceText: nil, subjectName: nil, bits: []).subjectId == nil)
    }
}
