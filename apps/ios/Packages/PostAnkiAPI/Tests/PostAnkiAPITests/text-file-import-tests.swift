import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Text file import contract")
    struct TextFileImportContractTests {
        @Test("should post the text and subject and read an Anki import result")
        func uploads() async throws {
            RecordingStub.install(body: Data(#"{"kind":"anki","importId":"txt-abc","parsed":3,"skippedEmpty":0,"newlyStaged":3}"#.utf8))

            let result = try await APIClient.uploadTextFile(text: "#separator:tab", subjectId: "sub_1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/text-file-imports")
            #expect(request.body?["text"] as? String == "#separator:tab")
            #expect(request.body?["subjectId"] as? String == "sub_1")
            #expect(result == .anki(importId: "txt-abc", parsed: 3, skippedEmpty: 0, newlyStaged: 3))
        }

        @Test("should read the status of an import")
        func status() async throws {
            RecordingStub.install(body: Data(#"{"importId":"txt-abc","staged":0,"imported":3,"extracted":1,"finished":3}"#.utf8))

            let status = try await APIClient.textFileImportStatus(importId: "txt-abc")

            #expect(RecordingStub.last?.path == "/text-file-imports/txt-abc")
            #expect(status.isFinished)
        }
    }
}

@Suite("Text file import rules")
struct TextFileImportRulesTests {
    @Test("should stop progress once failed and discarded sources are finished too")
    func finishedCountsFailures() {
        let done = TextFileImportStatus(importId: "a", staged: 0, imported: 3, extracted: 1, finished: 3)
        let running = TextFileImportStatus(importId: "a", staged: 0, imported: 3, extracted: 1, finished: 2)
        let waiting = TextFileImportStatus(importId: "a", staged: 1, imported: 3, extracted: 3, finished: 3)

        #expect(done.isFinished)
        #expect(!running.isFinished)
        #expect(!waiting.isFinished)
    }

    @Test("should refuse non-text, empty and oversized files before uploading")
    func checks() {
        #expect(TextFileImportRules.problem(fileName: "a.pdf", byteCount: 5) == "Only .txt files can be imported.")
        #expect(TextFileImportRules.problem(fileName: "a.txt", byteCount: 0) == "The file is empty.")
        #expect(TextFileImportRules.problem(fileName: "A.TXT", byteCount: 900_001) == "The file is too large (limit 900 KB).")
        #expect(TextFileImportRules.problem(fileName: "a.txt", byteCount: 10) == nil)
    }

    @Test("should show the server refusal in plain words")
    func refusal() {
        #expect(TextFileImportRules.message(for: APIError.badStatus(400, "subject_required")) == "Choose a subject for this file.")
    }
}
