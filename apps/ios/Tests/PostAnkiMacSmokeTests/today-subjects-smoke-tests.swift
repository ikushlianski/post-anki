import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Today lists subjects with checkboxes, skips honour the local day and survive offline")
    struct TodaySubjectsSmokeTests {
        private static let subjects = #"[{"id":"s1","name":"Math","parentId":null},{"id":"s2","name":"Algebra","parentId":"s1"},{"id":"s3","name":"History","parentId":null}]"#
        private static let counts = #"{"subjects":[{"subjectId":"s1","dueCount":3,"newCount":0,"todayCount":3,"skipped":false},{"subjectId":"s2","dueCount":1,"newCount":0,"todayCount":1,"skipped":false},{"subjectId":"s3","dueCount":2,"newCount":0,"todayCount":2,"skipped":false}],"unsorted":{"dueCount":0,"newCount":0},"newRemainingToday":0}"#
        private static let skippedCounts = counts.replacingOccurrences(of: #""todayCount":3,"skipped":false"#, with: #""todayCount":3,"skipped":true"#)
        private static let skipReply = #"{"dayKey":"\#(LocalDayKey.today())","subjectIds":["s1","s2"]}"#
        private static let cards = #"{"cards":[{"variantId":"v1","knowledgeBitId":"k1","kind":"wh_question","prompt":"What is 2+2?","answer":"4","background":null,"phase":"review","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}],"counts":{"new":0,"learning":0,"review":1},"newRemainingToday":0,"nextDueAt":null}"#

        private static func make() -> (TodaySubjectsModel, ReviewPackStore, PendingSubjectSkipQueue, UserDefaults) {
            let suite = "today-skips-\(UUID().uuidString)"
            let defaults = UserDefaults(suiteName: suite)!
            let pack = ReviewPackStore(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent("pack-\(UUID().uuidString).json"))
            let queue = PendingSubjectSkipQueue(defaults: defaults)

            return (TodaySubjectsModel(reviewPack: pack, pending: queue, onChanged: {}), pack, queue, defaults)
        }

        @Test("should list only top-level subjects due today and total their counts")
        func listsSubjects() async {
            let session = FakeServerSession(["/subjects/review-due-counts": .json(200, Self.counts), "/subjects": .json(200, Self.subjects)])
            defer { session.end() }
            let (model, _, _, _) = Self.make()

            await model.load()

            #expect(model.subjects.map(\.name) == ["History", "Math"])
            #expect(model.totalRemaining == 5)
        }

        @Test("should keep a skipped subject visible but leave it out of the remaining total")
        func skippedLeavesTotal() async {
            let session = FakeServerSession([
                "/subjects/review-due-counts": .json(200, Self.skippedCounts),
                "/subjects": .json(200, Self.subjects)
            ])
            defer { session.end() }
            let (model, _, _, _) = Self.make()

            await model.load()

            #expect(model.subjects.count == 2)
            #expect(model.subjects.first { $0.id == "s1" }?.isSkipped == true)
            #expect(model.totalRemaining == 2)
        }

        @Test("should skip with PUT and reload the counts afterwards")
        func skipsOnline() async {
            let session = FakeServerSession([
                "/subjects/review-due-counts": .json(200, Self.counts),
                "/subjects": .json(200, Self.subjects),
                "PUT /subject-day-skips/s1": .json(200, Self.skipReply)
            ])
            defer { session.end() }
            let (model, _, _, _) = Self.make()

            await model.load()
            await model.setSkipped("s1", skipped: true)

            #expect(FakeServer.writes.map(\.method) == ["PUT"])
            #expect(FakeServer.requested.filter { $0 == "/subjects/review-due-counts" }.count == 2)
            #expect(model.changeCount == 1)
        }

        @Test("should roll the checkbox back and say so when the server refuses the skip")
        func rollsBack() async {
            let session = FakeServerSession([
                "/subjects/review-due-counts": .json(200, Self.counts),
                "/subjects": .json(200, Self.subjects),
                "PUT /subject-day-skips/s1": .status(500)
            ])
            defer { session.end() }
            let (model, _, queue, _) = Self.make()

            await model.load()
            await model.setSkipped("s1", skipped: true)

            #expect(model.subjects.first { $0.id == "s1" }?.isSkipped == false)
            #expect(model.toggleError != nil)
            #expect(queue.isEmpty)
        }

        @Test("should apply a toggle made offline at once and queue it for later")
        func offlineToggle() async {
            let session = FakeServerSession([
                "/subjects/review-due-counts": .json(200, Self.counts),
                "/subjects": .json(200, Self.subjects),
                "PUT /subject-day-skips/s1": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }
            let (model, _, queue, _) = Self.make()

            await model.load()
            FakeServer.start([
                "/subjects/review-due-counts": .failure(.notConnectedToInternet),
                "/subjects": .failure(.notConnectedToInternet),
                "PUT /subject-day-skips/s1": .failure(.notConnectedToInternet)
            ])
            await model.setSkipped("s1", skipped: true)

            #expect(model.subjects.first { $0.id == "s1" }?.isSkipped == true)
            #expect(queue.entries(dayKey: LocalDayKey.today()) == ["s1": true, "s2": true])
            #expect(model.totalRemaining == 2)
        }

        @Test("should send queued skips when the network is back and then empty the queue")
        func flushesQueue() async {
            let session = FakeServerSession(["PUT /subject-day-skips/s1": .json(200, Self.skipReply), "PUT /subject-day-skips/s2": .json(200, Self.skipReply)])
            defer { session.end() }
            let (_, _, queue, _) = Self.make()

            queue.record(["s1", "s2"], skipped: true, dayKey: LocalDayKey.today())
            await queue.flush()

            #expect(FakeServer.writes.count == 2)
            #expect(queue.isEmpty)
        }

        @Test("should load a subject's cards only when it is expanded, showing the front text")
        func lazyCards() async {
            let session = FakeServerSession([
                "/subjects/review-due-counts": .json(200, Self.counts),
                "/subjects": .json(200, Self.subjects),
                "/knowledge-bits/review-cards": .json(200, Self.cards)
            ])
            defer { session.end() }
            let (model, _, _, _) = Self.make()

            await model.load()

            #expect(!FakeServer.requested.contains("/knowledge-bits/review-cards"))

            await model.loadCards(for: "s1")

            #expect(model.cards["s1"] == .loaded([TodaySubjectCard(id: "v1", front: "What is 2+2?")]))
            #expect(FakeServer.requests.last?.query?.contains("subjectId=s1") == true)
        }

        @Test("should drop cards of skipped subjects from the offline pack only on the pack's own day")
        func packHonoursSkipForToday() async {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("pack-\(UUID().uuidString).json")
            defer { try? FileManager.default.removeItem(at: file) }
            let store = ReviewPackStore(fileURL: file)
            let today = LocalDayKey.today()
            let pack = ReviewPack(
                generatedAt: "2026-11-10T12:00:00.000Z",
                dueBefore: "2026-11-11T12:00:00.000Z",
                truncated: false,
                cards: [
                    ReviewPackCard(card: ReviewPackStoreSmokeTests.card("a"), subjectId: "s1"),
                    ReviewPackCard(card: ReviewPackStoreSmokeTests.card("b"), subjectId: "s3")
                ],
                dayKey: today,
                skippedSubjectIds: ["s1"]
            )

            await store.replace(pack, fetchStartedAt: Date())

            #expect(await store.cards(scope: .all, today: today)?.cards.map(\.variantId) == ["b"])
            #expect(await store.cards(scope: .all, today: "2099-01-01")?.cards.map(\.variantId) == ["a", "b"])

            await store.setSkipped(["s1"], skipped: false, dayKey: today)

            #expect(await store.cards(scope: .all, today: today)?.cards.map(\.variantId) == ["a", "b"])
        }
    }
}
