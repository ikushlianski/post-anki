import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Submitted answers send the right request and are never lost on failure")
    struct AnswerWriteSmokeTests {
        private let answerPath = "/knowledge-bits/question-variants/var_01/answers"
        private let attemptsPath = "/subjects/sub_02/attempts"

        private let subject = Wire.decode(
            PracticeSubject.self,
            #"{"id":"sub_02","name":"Russian","kind":"language-practice"}"#
        )

        private nonisolated static let gradeFailures: [WriteFailureCase] = [
            .signedOut,
            .rejected("invalid_answer", message: "Couldn't grade that answer."),
            .offline
        ]

        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("answers-\(UUID().uuidString).json")
        }

        private func loadedQuickPractice(_ reply: FakeReply) async -> (IngestScreenModel, FakeServerSession) {
            let session = FakeServerSession([
                "/knowledge-bits/question-variants/next": .fixture("next-question-variants"),
                "POST \(answerPath)": reply
            ])
            let model = IngestScreenModel()

            await model.load()

            model.userAnswer = "It stops calls so the dependency can recover."

            return (model, session)
        }

        @Test("should post the typed answer for the current question and show the grader's feedback")
        func quickAnswerSucceeds() async throws {
            let (model, session) = await loadedQuickPractice(.fixture("graded-answer"))
            defer { session.end() }

            await model.submitAnswer()

            #expect(FakeServer.writes.map(\.method) == ["POST"])
            #expect(FakeServer.writes.map(\.path) == [answerPath])
            #expect(FakeServer.writes.first?.bodyObject == ["userAnswer": "It stops calls so the dependency can recover."] as NSDictionary)
            #expect(model.feedback == "Well put.")
            #expect(model.errorMessage == nil)
        }

        @Test("should keep the typed answer and the question when grading fails", arguments: gradeFailures)
        func quickAnswerFails(failure: WriteFailureCase) async throws {
            let (model, session) = await loadedQuickPractice(failure.reply)
            defer { session.end() }

            await model.submitAnswer()

            #expect(model.userAnswer == "It stops calls so the dependency can recover.")
            #expect(model.current?.variantId == "var_01")
            #expect(model.feedback == nil)
            #expect(model.errorMessage == "Couldn't grade that answer.")
            #expect(!model.isSubmitting)
        }

        @Test("should send a queued answer once and clear it from the queue")
        func queuedAnswerFlushes() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST \(answerPath)": .fixture("graded-answer")])
            defer { session.end() }

            let queue = PendingAnswerQueue(fileURL: file)

            await queue.enqueue(variantId: "var_01", userAnswer: "saved offline")
            await queue.flush()

            #expect(FakeServer.writes.map(\.path) == [answerPath])
            #expect(FakeServer.writes.first?.bodyObject == ["userAnswer": "saved offline"] as NSDictionary)
            #expect(await queue.count() == 0)
        }

        @Test("should keep a queued answer for the next try when the user is signed out or offline", arguments: [
            WriteFailureCase.signedOut,
            WriteFailureCase.offline
        ])
        func queuedAnswerKept(failure: WriteFailureCase) async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST \(answerPath)": failure.reply])
            defer { session.end() }

            let queue = PendingAnswerQueue(fileURL: file)

            await queue.enqueue(variantId: "var_01", userAnswer: "saved offline")
            await queue.flush()

            #expect(FakeServer.writes.count == 1)
            #expect(await queue.count() == 1)
        }

        @Test("should drop a queued answer the server rejects for good so it cannot block the queue")
        func queuedAnswerRejectedIsDropped() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST \(answerPath)": .json(400, #"{"error":"invalid_answer"}"#)])
            defer { session.end() }

            let queue = PendingAnswerQueue(fileURL: file)

            await queue.enqueue(variantId: "var_01", userAnswer: "saved offline")
            await queue.flush()

            #expect(await queue.count() == 0)
        }

        private func startedPractice(_ reply: FakeReply) async -> (PracticeModel, FakeServerSession) {
            let session = FakeServerSession([
                "/subjects/sub_02/practice-settings": .fixture("practice-settings"),
                "POST /subjects/sub_02/phrase-batches": .fixture("phrase-batch"),
                "POST \(attemptsPath)": reply
            ])
            let model = PracticeModel(subject: subject)

            await model.start()

            model.answers = ["ph_01": "  Я посмотрю этот запрос.  ", "ph_02": "Обсудим на стендапе."]

            return (model, session)
        }

        @Test("should post the trimmed phrase answers together and show each grade and mastered phrase")
        func phraseAnswersSucceed() async throws {
            let reply = """
            {"attempts":[\
            {"id":"at_1","phraseId":"ph_01","userAnswer":"a","score":5,"verdict":"Ok","feedback":"Good","nativeAlternatives":[]},\
            {"id":"at_2","phraseId":"ph_02","userAnswer":"b","score":3,"verdict":"NeedsReview","feedback":"Close","nativeAlternatives":[]}],\
            "phraseBankUpdates":[{"id":"u1","phraseText":"запрос на слияние","status":"mastered"}]}
            """
            let (model, session) = await startedPractice(.json(200, reply))
            defer { session.end() }

            await model.submit()

            let sent = FakeServer.writes.first(where: { $0.path == attemptsPath })
            let answers = sent?.bodyObject?["answers"] as? [NSDictionary]

            #expect(sent?.method == "POST")
            #expect(answers?.map { $0["phraseId"] as? String } == ["ph_01", "ph_02"])
            #expect(answers?.first?["userAnswer"] as? String == "Я посмотрю этот запрос.")
            #expect(model.results.keys.sorted() == ["ph_01", "ph_02"])
            #expect(model.chunkGraded)
            #expect(model.masteredPhrases == ["запрос на слияние"])
            #expect(model.errorMessage == nil)
        }

        @Test("should keep every typed phrase answer and allow resubmitting when submitting fails", arguments: [
            WriteFailureCase.signedOut,
            WriteFailureCase.rejected("not_a_language_practice_subject", message: "This subject isn't set up for language practice."),
            WriteFailureCase.offline
        ])
        func phraseAnswersFail(failure: WriteFailureCase) async throws {
            let (model, session) = await startedPractice(failure.reply)
            defer { session.end() }

            await model.submit()

            #expect(model.answers["ph_01"] == "  Я посмотрю этот запрос.  ")
            #expect(model.answers["ph_02"] == "Обсудим на стендапе.")
            #expect(model.results.isEmpty)
            #expect(model.errorMessage == failure.message)
            #expect(model.canSubmit)
        }
    }
}
