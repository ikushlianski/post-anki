import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Crash and data-loss guards")
    struct CrashGuardSmokeTests {
        @Test("should keep the latest mastery row instead of crashing when the server repeats a tag")
        func duplicateMasteryRows() throws {
            let json = Data("""
            [{"tagId":"t1","name":"A","status":"new"},{"tagId":"t1","name":"A","status":"mastered"},{"tagId":"t2","name":"B","status":"new"}]
            """.utf8)
            let rows = try JSONDecoder().decode([TagMastery].self, from: json)

            let index = TagsModel.index(rows)

            #expect(index.count == 2)
            #expect(index["t1"]?.status == "mastered")
        }

        @Test("should refuse plain http for a remote server but allow https and localhost")
        func addressRules() throws {
            func allowed(_ text: String) throws -> Bool {
                SettingsScreenModel.isAddressAllowed(try #require(URL(string: text)))
            }

            #expect(try allowed("https://example.com"))
            #expect(try allowed("http://localhost:3000"))
            #expect(try allowed("http://127.0.0.1:3000"))
            #expect(try !allowed("http://example.com"))
        }

        @Test("should send only one grading call when Return is pressed twice quickly")
        func quickPracticeSubmitOnce() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/question-variants/next": .fixture("next-question-variants"),
                "/knowledge-bits/question-variants/var_01/answers": .status(500)
            ])
            defer { session.end() }

            let model = IngestScreenModel()

            await model.load()
            model.userAnswer = "my answer"

            async let first: Void = model.submitAnswer()
            async let second: Void = model.submitAnswer()
            _ = await (first, second)

            #expect(FakeServer.requested.filter { $0.hasSuffix("/answers") }.count == 1)
        }

        @Test("should keep a queued answer when the server says 429, and drop it on a permanent 400")
        func answerQueueRetention() async throws {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("answers-\(UUID().uuidString).json")
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingAnswerQueue(fileURL: file)
            let session = FakeServerSession(["/knowledge-bits/question-variants/v429/answers": .status(429)])
            await queue.enqueue(variantId: "v429", userAnswer: "a")
            await queue.flush()
            session.end()

            #expect(try String(contentsOf: file, encoding: .utf8).contains("v429"))

            let permanent = FakeServerSession(["/knowledge-bits/question-variants/v429/answers": .status(400)])
            await queue.flush()
            permanent.end()

            #expect(try !String(contentsOf: file, encoding: .utf8).contains("v429"))
        }

        @Test("should keep an unreadable pending-grades file on disk instead of overwriting it")
        func unreadableGradeFileKept() async throws {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: directory) }

            let file = directory.appendingPathComponent("pending-grades.json")
            try Data("not json".utf8).write(to: file)

            let queue = PendingGradeQueue(fileURL: file)
            let saved = await queue.enqueue(
                RecordReviewInput(variantId: "v1", grade: .good, durationMs: 10, requestId: "r1"),
                knowledgeBitId: "b1"
            )

            let names = try FileManager.default.contentsOfDirectory(atPath: directory.path)
            let kept = try names.filter { $0.contains("unreadable") }
                .map { try String(contentsOf: directory.appendingPathComponent($0), encoding: .utf8) }

            #expect(saved)
            #expect(kept == ["not json"])
            #expect(await queue.count() == 1)
        }

        @Test("should keep an unreadable pending-answers file on disk instead of overwriting it")
        func unreadableAnswerFileKept() async throws {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: directory) }

            let file = directory.appendingPathComponent("pending-answers.json")
            try Data("not json".utf8).write(to: file)

            let queue = PendingAnswerQueue(fileURL: file)
            let saved = await queue.enqueue(variantId: "v1", userAnswer: "a")

            let names = try FileManager.default.contentsOfDirectory(atPath: directory.path)
            let kept = try names.filter { $0.contains("unreadable") }
                .map { try String(contentsOf: directory.appendingPathComponent($0), encoding: .utf8) }

            #expect(saved)
            #expect(kept == ["not json"])
            #expect(try String(contentsOf: file, encoding: .utf8).contains("v1"))
        }
    }
}
