import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("A review grade the server refuses brings the user back with Retry or Skip")
    struct SaveFailureReviewSmokeTests {
        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("review-failure-\(UUID().uuidString).json")
        }

        private func cardsJSON() -> String {
            let cards = (1...12).map { index -> String in
                let id = String(format: "%02d", index)

                return """
                {"variantId":"v\(id)","knowledgeBitId":"k\(id)","kind":"wh_question","prompt":"Q\(id)","answer":"A\(id)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"review","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return #"{"cards":[\#(cards.joined(separator: ","))],"counts":{"new":0,"learning":0,"review":12},"newRemainingToday":0,"nextDueAt":null}"#
        }

        private func failingModel(file: URL) async -> DueReviewModel {
            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file, retryDelay: .zero), retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(.good)
            await model.sendTask?.value

            return model
        }

        private var failing: [String: FakeReply] {
            ["/knowledge-bits/review-cards": .json(200, cardsJSON()), "/knowledge-bits/reviews": .json(400, #"{"error":"invalid_input"}"#)]
        }

        @Test("should bring the user back to the card whose grade failed and offer Retry or Skip")
        func promptsOnFailedGrade() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(failing)
            defer { session.end() }

            let model = await failingModel(file: file)

            #expect(model.saveFailure?.title == "Q01")
            #expect(model.saveFailure?.message.isEmpty == false)
            #expect(model.pendingCount == 1)
        }

        @Test("should send the retry with the original request id so the grade counts once")
        func retryKeepsRequestId() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(failing)
            defer { session.end() }

            let model = await failingModel(file: file)
            let original = FakeServer.writes.first?.bodyObject?["requestId"] as? String

            FakeServer.start(["/knowledge-bits/reviews": .fixture("record-review")])
            await model.retryFailedSave()
            await model.sendTask?.value

            #expect(original != nil)
            #expect(FakeServer.writes.count == 1)
            #expect(FakeServer.writes.first?.bodyObject?["requestId"] as? String == original)
            #expect(model.saveFailure == nil)
            #expect(model.pendingCount == 0)
            #expect(model.reviewedCount == 1)
        }

        @Test("should leave counts unchanged after Skip")
        func skipUncounts() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(failing)
            defer { session.end() }

            let model = await failingModel(file: file)

            #expect(model.reviewedCount == 1)

            await model.skipFailedSave()
            await model.sendTask?.value

            #expect(model.saveFailure == nil)
            #expect(model.reviewedCount == 0)
            #expect(model.gradedOtherCount == 0)
            #expect(model.pendingCount == 0)
            #expect(model.lastGraded == nil)
        }

        @Test("should hold later grades behind the failed one")
        func laterGradesWait() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(failing)
            defer { session.end() }

            let model = await failingModel(file: file)

            model.reveal()
            await model.grade(.good)
            await model.sendTask?.value

            #expect(FakeServer.writes.count == 1)
            #expect(model.pendingCount == 2)
            #expect(model.saveFailure != nil)

            FakeServer.start(["/knowledge-bits/reviews": .fixture("record-review")])
            await model.skipFailedSave()
            await model.sendTask?.value

            #expect(FakeServer.writes.count == 1)
            #expect(model.pendingCount == 0)
        }
    }
}
