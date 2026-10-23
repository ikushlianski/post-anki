import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Language practice, phrase bank and duplicates load from a fake server")
    struct LanguageSmokeTests {
        private let subject = try! JSONDecoder().decode(
            PracticeSubject.self,
            from: Data(#"{"id":"sub_02","name":"Russian","kind":"language-practice"}"#.utf8)
        )

        @Test("should list only language-practice subjects")
        func practiceSubjectsLoad() async throws {
            let session = FakeServerSession(["/subjects": .fixture("subjects")])
            defer { session.end() }

            let model = PracticeSubjectsModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.subjects.map(\.id) == ["sub_02"])
        }

        @Test("should show signed out for language subjects on a 401")
        func practiceSubjectsUnauthorized() async throws {
            let session = FakeServerSession(["/subjects": .status(401)])
            defer { session.end() }

            let model = PracticeSubjectsModel()

            await model.load()

            #expect(model.failureKind == .unauthorized)
            #expect(!model.hasLoaded)
        }

        @Test("should show offline for language subjects when the connection drops")
        func practiceSubjectsOffline() async throws {
            let session = FakeServerSession(["/subjects": .failure(.networkConnectionLost)])
            defer { session.end() }

            let model = PracticeSubjectsModel()

            await model.load()

            #expect(model.failureKind == .offline)
        }

        @Test("should load practice settings and a first batch of phrases split into chunks")
        func practiceStarts() async throws {
            let session = FakeServerSession([
                "/subjects/sub_02/practice-settings": .fixture("practice-settings"),
                "/subjects/sub_02/phrase-batches": .fixture("phrase-batch")
            ])
            defer { session.end() }

            let model = PracticeModel(subject: subject)

            await model.start()

            #expect(model.settings?.pack == "CodeReview")
            #expect(model.phrases.map(\.id) == ["ph_01", "ph_02"])
            #expect(model.chunk.count == 2)
            #expect(model.failureKind == nil)
        }

        @Test("should show signed out for practice on a 401 and never request phrases")
        func practiceUnauthorized() async throws {
            let session = FakeServerSession(["/subjects/sub_02/practice-settings": .status(401)])
            defer { session.end() }

            let model = PracticeModel(subject: subject)

            await model.start()

            #expect(model.failureKind == .unauthorized)
            #expect(model.phrases.isEmpty)
            #expect(!FakeServer.requested.contains("/subjects/sub_02/phrase-batches"))
        }

        @Test("should show offline for practice when the connection drops")
        func practiceOffline() async throws {
            let session = FakeServerSession(["/subjects/sub_02/practice-settings": .failure(.cannotConnectToHost)])
            defer { session.end() }

            let model = PracticeModel(subject: subject)

            await model.start()

            #expect(model.failureKind == .offline)
        }

        @Test("should split the phrase bank into learning and mastered phrases")
        func phraseBankLoads() async throws {
            let session = FakeServerSession(["/subjects/sub_02/phrase-bank": .fixture("phrase-bank")])
            defer { session.end() }

            let model = PhraseBankModel(subjectId: "sub_02")

            await model.load()

            #expect(model.bank?.active.map(\.id) == ["pbe_01", "pbe_02"])
            #expect(model.bank?.mastered.map(\.id) == ["pbe_03"])
            #expect(model.bank?.active.last?.statusLabel == "Struggling")
            #expect(model.failureKind == nil)
        }

        @Test("should show signed out for the phrase bank on a 401")
        func phraseBankUnauthorized() async throws {
            let session = FakeServerSession(["/subjects/sub_02/phrase-bank": .status(401)])
            defer { session.end() }

            let model = PhraseBankModel(subjectId: "sub_02")

            await model.load()

            #expect(model.failureKind == .unauthorized)
            #expect(model.bank == nil)
        }

        @Test("should show offline for the phrase bank when the connection drops")
        func phraseBankOffline() async throws {
            let session = FakeServerSession(["/subjects/sub_02/phrase-bank": .failure(.timedOut)])
            defer { session.end() }

            let model = PhraseBankModel(subjectId: "sub_02")

            await model.load()

            #expect(model.failureKind == .offline)
        }

        private var duplicateRoutes: [String: FakeReply] {
            [
                "/subjects": .fixture("subjects"),
                "/sources": .fixture("library-sources"),
                "/subject-duplicate-suggestions": .fixture("subject-duplicate-suggestions"),
                "/source-duplicate-suggestions": .fixture("source-duplicate-suggestions")
            ]
        }

        @Test("should load pending subject and source duplicate pairs with readable names")
        func duplicatesLoad() async throws {
            let session = FakeServerSession(duplicateRoutes)
            defer { session.end() }

            let model = DuplicateReviewModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.subjectPairs.map(\.id) == ["sds_01"])
            #expect(model.sourcePairs.map(\.id) == ["srd_01", "srd_02"])
            #expect(model.subjectName("sub_02") == "Spanish")
            #expect(model.sourceName("src_01") == "CircuitBreaker (Distributed systems)")
        }

        @Test("should label a removed source as removed instead of failing the duplicates list")
        func duplicatesRemovedSource() async throws {
            let session = FakeServerSession(duplicateRoutes)
            defer { session.end() }

            let model = DuplicateReviewModel()

            await model.load()

            #expect(model.sourceName("src_gone") == "(removed)")
            #expect(model.errorMessage == nil)
        }

        @Test("should show signed out for duplicates on a 401")
        func duplicatesUnauthorized() async throws {
            let session = FakeServerSession([
                "/subjects": .status(401),
                "/sources": .status(401),
                "/subject-duplicate-suggestions": .status(401),
                "/source-duplicate-suggestions": .status(401)
            ])
            defer { session.end() }

            let model = DuplicateReviewModel()

            await model.load()

            #expect(model.failureKind == .unauthorized)
            #expect(!model.hasLoaded)
        }

        @Test("should show offline for duplicates when the connection drops")
        func duplicatesOffline() async throws {
            let session = FakeServerSession([
                "/subjects": .failure(.notConnectedToInternet),
                "/sources": .failure(.notConnectedToInternet),
                "/subject-duplicate-suggestions": .failure(.notConnectedToInternet),
                "/source-duplicate-suggestions": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }

            let model = DuplicateReviewModel()

            await model.load()

            #expect(model.failureKind == .offline)
            #expect(!model.hasLoaded)
        }
    }
}
