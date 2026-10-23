import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Second review fixes hold against a fake server")
    struct ReviewFixes2SmokeTests {
        private let subject = try! JSONDecoder().decode(
            PracticeSubject.self,
            from: Data(#"{"id":"sub_02","name":"Russian","kind":"language-practice"}"#.utf8)
        )

        @Test("should load the map of the subject picked while the first load is still running")
        func switchingSubjectDuringLoad() async throws {
            let session = FakeServerSession([
                "/subjects": .fixture("subjects"),
                "/subjects/sub_01/domain-map": .fixture("domain-map"),
                "/subjects/sub_02/domain-map": .status(404)
            ])
            defer { session.end() }

            let model = DomainMapModel()
            let first = Task { await model.load() }

            await Task.yield()
            await model.select("sub_02")
            await first.value

            #expect(model.subjectId == "sub_02")
            #expect(model.tree.isEmpty)
            #expect(model.hasLoaded)
        }

        @Test("should clear an old practice error and generate phrases when a retry succeeds")
        func practiceRetryAfterFailure() async throws {
            let failing = FakeServerSession(["/subjects/sub_02/practice-settings": .failure(.networkConnectionLost)])
            let model = PracticeModel(subject: subject)

            await model.start()
            failing.end()

            #expect(model.errorMessage != nil)

            let working = FakeServerSession([
                "/subjects/sub_02/practice-settings": .fixture("practice-settings"),
                "/subjects/sub_02/phrase-batches": .fixture("phrase-batch")
            ])
            defer { working.end() }

            await model.start()

            #expect(model.errorMessage == nil)
            #expect(model.phrases.map(\.id) == ["ph_01", "ph_02"])
        }

        @Test("should not record an error when a practice request is cancelled")
        func practiceCancelledIsSilent() async throws {
            let session = FakeServerSession(["/subjects/sub_02/practice-settings": .failure(.cancelled)])
            defer { session.end() }

            let model = PracticeModel(subject: subject)

            await model.start()

            #expect(model.errorMessage == nil)
            #expect(model.failureKind == nil)
            #expect(model.settings == nil)
        }

        @Test("should drop the old writing error when the history reloads")
        func writingHistoryClearsError() async throws {
            let failing = FakeServerSession(["/subjects/sub_02/writing-checks": .failure(.networkConnectionLost)])
            let model = WritingCheckModel(subjectId: "sub_02")

            await model.loadHistory()
            failing.end()

            #expect(model.errorMessage != nil)

            let cancelled = FakeServerSession(["/subjects/sub_02/writing-checks": .failure(.cancelled)])
            defer { cancelled.end() }

            await model.retry()

            #expect(model.errorMessage == nil)
        }

        @Test("should not show a cancelled phrase bank load as an error")
        func phraseBankCancelledIsSilent() async throws {
            let session = FakeServerSession(["/subjects/sub_02/phrase-bank": .failure(.cancelled)])
            defer { session.end() }

            let model = PhraseBankModel(subjectId: "sub_02")

            await model.load()

            #expect(model.errorMessage == nil)
        }
    }
}
