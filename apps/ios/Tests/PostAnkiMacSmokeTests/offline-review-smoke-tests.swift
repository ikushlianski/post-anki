import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review keeps working offline from the saved pack")
    struct OfflineReviewSmokeTests {
        private typealias Pack = ReviewPackStoreSmokeTests

        private static let gradeSaved = #"{"reviewId":"rev_1","knowledgeBitId":"bit_a","phase":"review","dueAt":"2026-11-10T09:00:00.000Z","intervalDays":6,"lapses":0,"leech":false,"suspended":false}"#

        private struct Rig {
            let model: DueReviewModel
            let queue: PendingGradeQueue
            let store: ReviewPackStore
            let files: [URL]

            func cleanUp() {
                files.forEach { try? FileManager.default.removeItem(at: $0) }
            }
        }

        private func rig(subject: String? = nil, cards: [ReviewPackCard]? = nil) async -> Rig {
            let queueFile = FileManager.default.temporaryDirectory.appendingPathComponent("offline-q-\(UUID().uuidString).json")
            let packFile = FileManager.default.temporaryDirectory.appendingPathComponent("offline-p-\(UUID().uuidString).json")
            let queue = PendingGradeQueue(fileURL: queueFile)
            let store = ReviewPackStore(fileURL: packFile)
            let packCards = cards ?? [
                ReviewPackCard(card: Pack.card("a"), subjectId: "s1"),
                ReviewPackCard(card: Pack.card("b"), subjectId: "s1"),
                ReviewPackCard(card: Pack.card("c"), subjectId: "s2")
            ]

            await store.replace(Pack.pack(packCards), fetchStartedAt: Date())

            let scope = subject.map { DueReviewScope.subject(id: $0, name: "Subject") }

            return Rig(
                model: DueReviewModel(gradeQueue: queue, reviewPack: store, scope: scope, retryDelay: nil),
                queue: queue,
                store: store,
                files: [queueFile, packFile]
            )
        }

        private static let offlineRoutes: [String: FakeReply] = [
            "/knowledge-bits/review-cards": .failure(.notConnectedToInternet),
            "/knowledge-bits/reviews": .failure(.notConnectedToInternet)
        ]

        @Test("should show the saved cards with an offline caption when the server cannot be reached")
        func servesPack() async {
            let session = FakeServerSession(Self.offlineRoutes)
            defer { session.end() }
            let rig = await rig()
            defer { rig.cleanUp() }

            await rig.model.load()

            #expect(rig.model.state == .card)
            #expect(rig.model.current?.variantId == "a")
            #expect(rig.model.isServingPack)
            #expect(rig.model.packCaption?.hasPrefix("Offline: using cards saved") == true)
            #expect(rig.model.remainingCounts?.review == 3)
        }

        @Test("should not guess a subject's cards offline, since the pack is not organised by subject tree")
        func subjectScopeNotServed() async {
            let session = FakeServerSession(Self.offlineRoutes)
            defer { session.end() }
            let rig = await rig(subject: "s2")
            defer { rig.cleanUp() }

            await rig.model.load()

            #expect(!rig.model.isServingPack)
            #expect(rig.model.isErrorState)
        }

        @Test("should skip cards already graded since the pack was fetched")
        func skipsGraded() async {
            let session = FakeServerSession(Self.offlineRoutes)
            defer { session.end() }
            let rig = await rig()
            defer { rig.cleanUp() }

            await rig.store.noteGraded(variantId: "a", bitId: "bit_a")
            await rig.model.load()

            #expect(rig.model.current?.variantId == "b")
        }

        @Test("should keep a grade given offline in the outbox with the time it was given, then send it")
        func gradeQueuedWithReviewTime() async throws {
            let session = FakeServerSession(Self.offlineRoutes)
            let rig = await rig()
            defer { rig.cleanUp() }
            let before = Date().addingTimeInterval(-2)

            await rig.model.load()
            rig.model.reveal()
            await rig.model.grade(.good)
            await rig.model.sendTask?.value
            session.end()

            #expect(await rig.queue.count() == 1)
            #expect(rig.model.current?.variantId == "b")
            #expect(rig.model.queue.map(\.variantId) == ["c"])

            let online = FakeServerSession(["/knowledge-bits/reviews": .json(201, Self.gradeSaved)])
            defer { online.end() }

            await rig.queue.flush()

            let sent = try #require(FakeServer.writes.first?.bodyObject)
            let reviewedAt = try #require(sent["reviewedAt"] as? String)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

            #expect(try #require(formatter.date(from: reviewedAt)) >= before)
            #expect(sent["sentAt"] is String)
            #expect(await rig.queue.count() == 0)
        }

        @Test("should bring a card back when its offline grade is undone")
        func undoRestores() async {
            let session = FakeServerSession(Self.offlineRoutes)
            defer { session.end() }
            let rig = await rig()
            defer { rig.cleanUp() }

            await rig.model.load()
            rig.model.reveal()
            await rig.model.grade(.good)
            await rig.model.sendTask?.value
            await rig.model.undo()

            #expect(rig.model.current?.variantId == "a")
            #expect(await rig.queue.count() == 0)
            #expect(await rig.store.cards(scope: .all)?.gradedVariantIds.isEmpty == true)
        }

        @Test("should tell the learner when every saved card is done")
        func finishedMessage() async {
            let session = FakeServerSession(Self.offlineRoutes)
            defer { session.end() }
            let rig = await rig(cards: [ReviewPackCard(card: Pack.card("a"))])
            defer { rig.cleanUp() }

            await rig.model.load()
            rig.model.reveal()
            await rig.model.grade(.good)
            await rig.model.sendTask?.value

            #expect(rig.model.state == .empty)
            #expect(rig.model.isServingPack)
        }

        @Test("should fail normally when nothing was ever saved")
        func noPackNoFallback() async {
            let session = FakeServerSession(Self.offlineRoutes)
            defer { session.end() }
            let rig = await rig(cards: [])
            await rig.store.clear()
            defer { rig.cleanUp() }

            await rig.model.load()

            #expect(rig.model.isErrorState)
            #expect(!rig.model.isServingPack)
        }

        @Test("should drop a queued grade the server says is too old or too far ahead")
        func outOfRangeDropped() async {
            let session = FakeServerSession(["/knowledge-bits/reviews": .json(400, #"{"error":"review_time_out_of_range"}"#)])
            defer { session.end() }
            let queueFile = FileManager.default.temporaryDirectory.appendingPathComponent("offline-range-\(UUID().uuidString).json")
            defer { try? FileManager.default.removeItem(at: queueFile) }
            let queue = PendingGradeQueue(fileURL: queueFile)

            await queue.enqueue(RecordReviewInput(variantId: "a", grade: .good, durationMs: 10, requestId: UUID().uuidString.lowercased()), knowledgeBitId: "bit_a")
            await queue.flush()

            #expect(await queue.count() == 0)
            #expect(await queue.failure == nil)
        }
    }
}
