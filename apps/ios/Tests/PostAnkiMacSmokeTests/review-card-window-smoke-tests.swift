import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review keeps a local window of cards and sends answers in the background")
    struct ReviewCardWindowSmokeTests {
        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("window-\(UUID().uuidString).json")
        }

        private func cardsJSON(_ range: ClosedRange<Int>) -> String {
            let cards = range.map { index -> String in
                let id = String(format: "%02d", index)

                return """
                {"variantId":"v\(id)","knowledgeBitId":"k\(id)","kind":"wh_question","prompt":"Q\(id)","answer":"A\(id)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"review","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":0,"learning":0,"review":60},\
            "newRemainingToday":0,"nextDueAt":null}
            """
        }

        private static let gradeResult = #"{"reviewId":"rev_1","knowledgeBitId":"k01","phase":"learning","dueAt":"2026-10-28T09:00:00.000Z","intervalDays":0,"lapses":0,"leech":false,"suspended":false}"#

        private func routes(cards: ClosedRange<Int>, reviews: FakeReply = .fixture("record-review")) -> [String: FakeReply] {
            ["/knowledge-bits/review-cards": .json(200, cardsJSON(cards)), "/knowledge-bits/reviews": reviews]
        }

        private func eventually(_ condition: () async -> Bool) async throws {
            for _ in 0..<100 {
                if await condition() { return }

                try await Task.sleep(for: .milliseconds(20))
            }
        }

        private func gradeCards(_ model: DueReviewModel, count: Int) async {
            for _ in 0..<count {
                model.reveal()
                await model.grade(.good)
            }
        }

        private func shownIds(_ model: DueReviewModel) -> [String] {
            (model.current.map { [$0.variantId] } ?? []) + model.queue.map(\.variantId)
        }

        @Test("should ask for more cards only once fewer than eight are left")
        func topUpTrigger() {
            #expect(!ReviewCardWindow.needsTopUp(remaining: 8, exhausted: false, inFlight: false))
            #expect(ReviewCardWindow.needsTopUp(remaining: 7, exhausted: false, inFlight: false))
            #expect(!ReviewCardWindow.needsTopUp(remaining: 7, exhausted: true, inFlight: false))
            #expect(!ReviewCardWindow.needsTopUp(remaining: 7, exhausted: false, inFlight: true))
        }

        @Test("should top the window up in the background without showing any card twice")
        func topUpHasNoDuplicates() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(cards: 1...20, reviews: .held(200, Self.gradeResult)))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()

            #expect(model.queue.count == 19)

            FakeServer.start(routes(cards: 1...50, reviews: .held(200, Self.gradeResult)))

            await gradeCards(model, count: 12)
            await model.topUpTask?.value

            let ids = shownIds(model)

            #expect(Set(ids).count == ids.count)
            #expect(ids.contains("v50"))
            #expect(ids.allSatisfy { $0 >= "v13" })
            #expect(ids.count >= ReviewCardWindow.target)
            #expect(FakeServer.requested.filter { $0 == "/knowledge-bits/review-cards" }.count == 1)

            await model.stopBackgroundWork()
        }

        @Test("should never re-add a card whose grade is still waiting to be sent")
        func topUpSkipsQueuedGrades() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(cards: 1...20, reviews: .failure(.notConnectedToInternet)))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()

            FakeServer.start(routes(cards: 1...50, reviews: .failure(.notConnectedToInternet)))

            await gradeCards(model, count: 12)
            await model.topUpTask?.value

            let ids = shownIds(model)

            #expect(ids.contains("v50"))
            #expect(ids.allSatisfy { $0 >= "v13" })

            await model.stopBackgroundWork()
        }

        @Test("should drop a held card that the server no longer lists as due")
        func answeredElsewhereIsDropped() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(cards: 1...20))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()

            FakeServer.start(routes(cards: 1...14))

            await gradeCards(model, count: 12)
            await model.topUpTask?.value

            #expect(!shownIds(model).contains("v15"))
            #expect(!shownIds(model).contains("v20"))

            await model.stopBackgroundWork()
        }

        @Test("should show the next card straight away while the answer is still being sent")
        func gradeDoesNotWaitForNetwork() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingGradeQueue(fileURL: file)
            let session = FakeServerSession(routes(cards: 1...20, reviews: .held(200, Self.gradeResult)))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: queue, retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(.good)

            #expect(model.current?.variantId == "v02")
            #expect(model.reviewedCount == 1)
            #expect(await queue.count() == 1)

            try await eventually { FakeServer.heldCount == 1 }

            FakeServer.releaseHeld()
            await model.sendTask?.value

            #expect(await queue.count() == 0)
            #expect(model.pendingCount == 0)
            #expect(FakeServer.requested.filter { $0 == "/knowledge-bits/reviews" }.count == 1)
        }

        @Test("should keep an answer queued when sending fails and send it once on the next try")
        func failedSendStaysQueued() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let queue = PendingGradeQueue(fileURL: file)
            let offline = FakeServerSession(routes(cards: 1...20, reviews: .failure(.notConnectedToInternet)))

            let model = DueReviewModel(gradeQueue: queue, retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(.good)
            await model.sendTask?.value

            #expect(model.current?.variantId == "v02")
            #expect(await queue.count() == 1)
            #expect(model.pendingCount == 1)

            offline.end()

            let online = FakeServerSession(routes(cards: 1...20))
            defer { online.end() }

            model.sendPendingInBackground()
            await model.sendTask?.value

            #expect(await queue.count() == 0)
            #expect(FakeServer.requested.filter { $0 == "/knowledge-bits/reviews" }.count == 1)
        }

        @Test("should not ask for more cards when the server had fewer than a full window")
        func shortQueueNeverTopsUp() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(cards: 1...3))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()
            await gradeCards(model, count: 1)

            #expect(model.topUpTask == nil)
            #expect(model.queue.count == 1)
            #expect(FakeServer.requested.filter { $0 == "/knowledge-bits/review-cards" }.count == 1)
        }

        @Test("should rebuild the window on refresh without bringing back answers that are still being sent")
        func refreshRebuildsWindow() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(cards: 1...20, reviews: .held(200, Self.gradeResult)))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()
            await gradeCards(model, count: 12)

            let generation = model.windowGeneration

            await model.load()

            #expect(model.windowGeneration > generation)
            #expect(model.current?.variantId == "v13")
            #expect(shownIds(model).allSatisfy { $0 >= "v13" })

            await model.stopBackgroundWork()
        }

        @Test("should not show a card graded Easy again in the same session after its answer was sent and the list reloads")
        func easyGradedCardStaysGone() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(cards: 1...20))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()

            for _ in 0..<2 {
                model.reveal()
                await model.grade(.easy)
            }

            try await eventually { model.pendingCount == 0 }
            await model.load()

            let ids = shownIds(model)

            #expect(!ids.contains("v01"))
            #expect(!ids.contains("v02"))
            #expect(model.current?.variantId == "v03")

            await model.stopBackgroundWork()
        }

        @Test("should show a card again after its Easy grade is undone")
        func undoneEasyCardReturns() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(routes(cards: 1...20, reviews: .held(200, Self.gradeResult)))
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(.easy)
            await model.undo()

            #expect(model.current?.variantId == "v01")
            #expect(model.easyGradedVariantIds.isEmpty)

            await model.stopBackgroundWork()
        }
    }
}
