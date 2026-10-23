import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Offline data stays tied to the server it came from")
    struct ServerBoundQueueSmokeTests {
        private let otherServer = "https://other.postanki.test"
        private let fakeServer = "https://\(FakeServer.host)"

        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("queue-\(UUID().uuidString).json")
        }

        @Test("should hold queued grades back from a different server and send them when the original server returns")
        func gradesFollowTheirServer() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["/knowledge-bits/reviews": .fixture("record-review")])
            defer { session.end() }

            let queue = PendingGradeQueue(fileURL: file)
            await queue.enqueue(
                RecordReviewInput(variantId: "v1", grade: .good, durationMs: 10, requestId: "r1"),
                knowledgeBitId: "kb_01"
            )

            APIClient.baseURLString = otherServer
            await queue.flush()

            #expect(FakeServer.requested.isEmpty)
            #expect(await queue.count() == 0)
            #expect(await queue.pendingKnowledgeBitIds().isEmpty)

            APIClient.baseURLString = fakeServer

            #expect(await queue.count() == 1)

            await queue.flush()

            #expect(FakeServer.requested == ["/knowledge-bits/reviews"])
            #expect(await queue.count() == 0)
        }

        @Test("should hold queued answers back from a different server")
        func answersFollowTheirServer() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["/knowledge-bits/question-variants/v1/answers": .fixture("graded-answer")])
            defer { session.end() }

            let queue = PendingAnswerQueue(fileURL: file)
            await queue.enqueue(variantId: "v1", userAnswer: "a")

            APIClient.baseURLString = otherServer
            await queue.flush()

            #expect(FakeServer.requested.isEmpty)
            #expect(await queue.count() == 0)

            APIClient.baseURLString = fakeServer
            await queue.flush()

            #expect(FakeServer.requested.count == 1)
            #expect(await queue.count() == 0)
        }

        @Test("should treat the same address written with a different case or trailing slash as the same server")
        func addressesNormalise() {
            #expect(ServerScope.normalize(" HTTPS://Api.Example.com// ") == "https://api.example.com")
        }

        @Test("should not show cached questions saved for another server")
        func cachedQuestionsFollowTheirServer() async throws {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }

            let session = FakeServerSession([:])
            defer { session.end() }

            let variants = try JSONDecoder().decode(
                [NextQuestionVariant].self,
                from: SmokeFixture.data("next-question-variants")
            )

            VariantCache.save(variants, topicId: "t1", in: directory)

            #expect(VariantCache.load(topicId: "t1", in: directory).count == 2)

            APIClient.baseURLString = otherServer

            #expect(VariantCache.load(topicId: "t1", in: directory).isEmpty)

            APIClient.baseURLString = fakeServer

            #expect(VariantCache.load(topicId: "t1", in: directory).count == 2)
        }

        @Test("should forget the last studied course when the server address changes")
        func lastCourseFollowsItsServer() throws {
            let defaults = try #require(UserDefaults(suiteName: "last-studied-\(UUID().uuidString)"))
            let session = FakeServerSession([:])
            defer { session.end() }

            LastStudied.record(curriculumId: "c1", curriculumName: "Networks", defaults: defaults)

            #expect(LastStudied.curriculumId(defaults: defaults) == "c1")

            APIClient.baseURLString = otherServer

            #expect(LastStudied.curriculumId(defaults: defaults) == nil)
            #expect(LastStudied.curriculumName(defaults: defaults) == nil)

            APIClient.baseURLString = fakeServer

            #expect(LastStudied.curriculumName(defaults: defaults) == "Networks")
        }

        @Test("should give up on a queued answer after five failed grading attempts and leave other answers alone")
        func answerRetriesAreBounded() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingAnswerQueue(fileURL: file)
            let session = FakeServerSession(["/knowledge-bits/question-variants/bad/answers": .status(502)])
            defer { session.end() }

            await queue.enqueue(variantId: "bad", userAnswer: "a")

            for _ in 0..<(PendingAnswerQueue.maxFailedAttempts - 1) {
                await queue.flush()
            }

            #expect(await queue.count() == 1)

            await queue.flush()

            #expect(await queue.count() == 0)
            #expect(FakeServer.requested.count == PendingAnswerQueue.maxFailedAttempts)

            await queue.flush()

            #expect(FakeServer.requested.count == PendingAnswerQueue.maxFailedAttempts)
        }

        @Test("should keep trying a queued answer while the network is down, without using up attempts")
        func offlineDoesNotUseAttempts() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingAnswerQueue(fileURL: file)
            let session = FakeServerSession(["/knowledge-bits/question-variants/v1/answers": .failure(.notConnectedToInternet)])
            defer { session.end() }

            await queue.enqueue(variantId: "v1", userAnswer: "a")

            for _ in 0..<(PendingAnswerQueue.maxFailedAttempts + 2) {
                await queue.flush()
            }

            #expect(await queue.count() == 1)
        }

        @Test("should send queued work and refresh the waiting count shown on the review screen when the app regains focus")
        func flushRefreshesWaitingCount() async throws {
            let gradeFile = tempFile()
            let answerFile = tempFile()
            defer {
                try? FileManager.default.removeItem(at: gradeFile)
                try? FileManager.default.removeItem(at: answerFile)
            }

            let grades = PendingGradeQueue(fileURL: gradeFile)
            let answers = PendingAnswerQueue(fileURL: answerFile)

            let offline = FakeServerSession([
                "/knowledge-bits/review-cards": .fixture("review-cards"),
                "/knowledge-bits/reviews": .failure(.notConnectedToInternet)
            ])

            let model = DueReviewModel(gradeQueue: grades)

            await model.load()
            model.reveal()
            await model.grade(.good)
            await answers.enqueue(variantId: "v1", userAnswer: "a")
            offline.end()

            #expect(model.pendingCount == 1)

            let online = FakeServerSession([
                "/knowledge-bits/reviews": .fixture("record-review"),
                "/knowledge-bits/question-variants/v1/answers": .fixture("graded-answer")
            ])
            defer { online.end() }

            await PendingQueueFlusher.flushAll(grades: grades, answers: answers)

            for _ in 0..<200 where model.pendingCount != 0 {
                try await Task.sleep(for: .milliseconds(10))
            }

            #expect(model.pendingCount == 0)
            #expect(await answers.count() == 0)
            #expect(FakeServer.requested.sorted() == [
                "/knowledge-bits/question-variants/v1/answers",
                "/knowledge-bits/reviews"
            ])
        }
    }
}
