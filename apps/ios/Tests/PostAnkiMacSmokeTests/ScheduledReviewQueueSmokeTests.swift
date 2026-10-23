import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Scheduled review grades survive offline, undo and server errors")
    struct ScheduledReviewQueueSmokeTests {
        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("grades-\(UUID().uuidString).json")
        }

        private func gradeOfflineOnFirstCard(queue: PendingGradeQueue) async -> DueReviewModel {
            let offline = FakeServerSession([
                "/knowledge-bits/review-cards": .fixture("review-cards"),
                "/knowledge-bits/reviews": .failure(.notConnectedToInternet)
            ])
            defer { offline.end() }

            let model = DueReviewModel(gradeQueue: queue)

            await model.load()
            model.reveal()
            await model.grade(.good)

            return model
        }

        @Test("should show the answer on the first Space or Return and rate Good on the second")
        func confirmKeyRevealsThenGradesGood() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .fixture("review-cards"),
                "/knowledge-bits/reviews": .fixture("record-review")
            ])
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file))

            await model.load()

            #expect(model.handleConfirmKey())
            #expect(model.isRevealed)
            #expect(model.reviewedCount == 0)

            #expect(model.handleConfirmKey())

            for _ in 0..<50 where model.reviewedCount == 0 {
                try await Task.sleep(for: .milliseconds(20))
            }

            #expect(model.reviewedCount == 1)
            #expect(!model.isRevealed)
        }

        @Test("should save a grade made offline, show the next card, and send it exactly once when back online")
        func offlineGradeIsSentOnce() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingGradeQueue(fileURL: file)
            let model = await gradeOfflineOnFirstCard(queue: queue)

            #expect(model.pendingCount == 1)
            #expect(model.current?.variantId == "var_02")
            #expect(model.notice == "Saved offline, will send later")

            let online = FakeServerSession(["/knowledge-bits/reviews": .fixture("record-review")])
            defer { online.end() }

            await queue.flush()
            await queue.flush()

            #expect(await queue.count() == 0)
            #expect(FakeServer.requested.filter { $0 == "/knowledge-bits/reviews" }.count == 1)
        }

        @Test("should remove a queued grade on undo so it is never sent, and bring the card back")
        func undoBeforeSend() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingGradeQueue(fileURL: file)
            let model = await gradeOfflineOnFirstCard(queue: queue)

            await model.undo()

            #expect(model.current?.variantId == "var_01")
            #expect(model.pendingCount == 0)
            #expect(model.lastGraded == nil)

            let online = FakeServerSession(["/knowledge-bits/reviews": .fixture("record-review")])
            defer { online.end() }

            await queue.flush()

            #expect(FakeServer.requested.filter { $0 == "/knowledge-bits/reviews" }.isEmpty)
        }

        @Test("should undo a grade that already reached the server by deleting that review")
        func undoAfterSend() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .fixture("review-cards"),
                "/knowledge-bits/reviews": .fixture("record-review"),
                "/knowledge-bits/reviews/rev_01": .fixture("undo-review")
            ])
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file))

            await model.load()
            model.reveal()
            await model.grade(.good)
            await model.undo()

            #expect(FakeServer.requested.contains("/knowledge-bits/reviews/rev_01"))
            #expect(model.current?.variantId == "var_01")
            #expect(model.lastGraded == nil)
        }

        @Test("should drop a queued grade the server permanently rejects and keep one it failed to process")
        func rejectedGradeDroppedServerErrorKept() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingGradeQueue(fileURL: file)
            let input = RecordReviewInput(variantId: "v1", grade: .good, durationMs: 10, requestId: "r1")

            let failing = FakeServerSession(["/knowledge-bits/reviews": .status(500)])
            await queue.enqueue(input, knowledgeBitId: "kb_01")
            await queue.flush()

            #expect(await queue.count() == 1)

            failing.end()

            let rejecting = FakeServerSession(["/knowledge-bits/reviews": .status(404)])
            defer { rejecting.end() }

            await queue.flush()

            #expect(await queue.count() == 0)
        }
    }
}
