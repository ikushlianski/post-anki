import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Sign-out removes the account's local data")
    struct SignOutCleanupSmokeTests {
        @Test("should drop a queued grade, queued answer, saved offline pack, cached cards, last studied and drafts")
        func clearsEverything() async throws {
            let id = UUID().uuidString
            let gradeFile = FileManager.default.temporaryDirectory.appendingPathComponent("grades-\(id).json")
            let answerFile = FileManager.default.temporaryDirectory.appendingPathComponent("answers-\(id).json")
            let cacheDir = FileManager.default.temporaryDirectory.appendingPathComponent("cache-\(id)", isDirectory: true)
            let suite = "signout-\(id)"
            let defaults = try #require(UserDefaults(suiteName: suite))
            defer {
                defaults.removePersistentDomain(forName: suite)
                try? FileManager.default.removeItem(at: gradeFile)
                try? FileManager.default.removeItem(at: answerFile)
                try? FileManager.default.removeItem(at: cacheDir)
            }

            let packFile = FileManager.default.temporaryDirectory.appendingPathComponent("pack-\(id).json")
            let packStore = ReviewPackStore(fileURL: packFile)
            defer { try? FileManager.default.removeItem(at: packFile) }

            await packStore.replace(
                ReviewPackStoreSmokeTests.pack([ReviewPackCard(card: ReviewPackStoreSmokeTests.card("a"))]),
                fetchStartedAt: Date()
            )

            let grades = PendingGradeQueue(fileURL: gradeFile)
            let answers = PendingAnswerQueue(fileURL: answerFile)

            await grades.enqueue(RecordReviewInput(variantId: "v1", grade: .good, durationMs: 10, requestId: "r1"), knowledgeBitId: "kb_01")
            await answers.enqueue(variantId: "v1", userAnswer: "an answer")
            LastStudied.record(curriculumId: "c1", curriculumName: "Course", defaults: defaults)
            UserDefaultsChatQueueDraftStore(defaults: defaults).save("chat draft", cardId: "kb_01")
            UserDefaultsAddDraftStore(defaults: defaults).save("add draft", key: "k")
            UnsentDraftStore.shared.set("ask draft", for: UnsentDraftStore.key("ask"))

            #expect(await grades.count() == 1)

            await SignOutCleanup.run(gradeQueue: grades, answerQueue: answers, reviewPackStore: packStore, variantCacheDirectory: cacheDir, defaults: defaults)

            #expect(await grades.count() == 0)
            #expect(await answers.count() == 0)
            #expect(await packStore.cards(scope: .all) == nil)
            #expect(LastStudied.curriculumId(defaults: defaults) == nil)
            #expect(UserDefaultsChatQueueDraftStore(defaults: defaults).load(cardId: "kb_01") == "")
            #expect(UserDefaultsAddDraftStore(defaults: defaults).load(key: "k") == "")
            #expect(UnsentDraftStore.shared.text(for: UnsentDraftStore.key("ask")) == nil)
        }
    }
}
