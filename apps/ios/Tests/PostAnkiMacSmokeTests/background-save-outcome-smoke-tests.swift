import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Background saves tell a lost card, a bad connection and a real failure apart")
    struct BackgroundSaveOutcomeSmokeTests {
        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("outcome-\(UUID().uuidString).json")
        }

        @Test("should treat an already-decided card as gone, not as a failure")
        func alreadyDecidedIsGone() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST /knowledge-bits/a/approve": .json(409, #"{"error":"blocked"}"#)])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .approve)
            await queue.flush()

            #expect(await queue.failure == nil)
            #expect(await queue.count() == 0)
            #expect(await queue.takeSettled().map(\.result) == [.stale])
            #expect(BackgroundSaveOutcome.classify(APIError.badStatus(404, nil)) == .stale)
            #expect(BackgroundSaveOutcome.classify(APIError.badStatus(403, "not_approved")) == .stale)
        }

        @Test("should stay quiet while offline and keep the decision queued")
        func offlineStaysQuiet() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST /knowledge-bits/a/approve": .failure(.notConnectedToInternet)])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .approve)
            await queue.flush()

            #expect(await queue.failure == nil)
            #expect(await queue.count() == 1)
            #expect(FakeServer.writes.count == 1)
        }

        @Test("should surface a failure after three server errors and hold later decisions behind it")
        func repeatedServerErrorsFail() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "POST /knowledge-bits/a/approve": .json(500, "{}"),
                "POST /knowledge-bits/b/approve": .json(200, "{}")
            ])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .approve)
            _ = await queue.enqueue(bitId: "b", kind: .approve)
            await queue.flush()

            #expect(FakeServer.writes.map(\.path) == Array(repeating: "/knowledge-bits/a/approve", count: 3))
            #expect(await queue.failure?.bitId == "a")
            #expect(await queue.count() == 2)

            FakeServer.start([
                "POST /knowledge-bits/a/approve": .json(200, "{}"),
                "POST /knowledge-bits/b/approve": .json(200, "{}")
            ])
            await queue.retryFailed()
            await queue.flush()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve", "/knowledge-bits/b/approve"])
            #expect(await queue.count() == 0)
        }

        @Test("should treat a refusal such as a bad request as a failure at once")
        func refusalFailsImmediately() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST /knowledge-bits/a/approve": .json(409, #"{"error":"no_variant"}"#)])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .approve)
            await queue.flush()

            #expect(FakeServer.writes.count == 1)
            #expect(await queue.failure?.message == "This item has no questions yet, so it can't be approved.")
        }
    }
}
