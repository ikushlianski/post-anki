import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Triage decisions are saved in order and survive quitting")
    struct PendingDecisionQueueSmokeTests {
        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("decisions-\(UUID().uuidString).json")
        }

        private func waitForHeld(_ count: Int) async throws {
            for _ in 0..<300 where FakeServer.heldCount < count { try await Task.sleep(for: .milliseconds(10)) }
        }

        @Test("should send decisions in the order made even when an earlier one is slow")
        func ordersDecisions() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "POST /knowledge-bits/a/approve": .held(200, "{}"),
                "POST /knowledge-bits/b/approve": .json(200, "{}")
            ])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .approve)
            _ = await queue.enqueue(bitId: "b", kind: .approve)

            let flushing = Task { await queue.flush() }

            try await waitForHeld(1)

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve"])

            FakeServer.releaseHeld()
            await flushing.value

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/approve", "/knowledge-bits/b/approve"])
            #expect(await queue.count() == 0)
        }

        @Test("should not send the same decision twice when saving is triggered again mid-flight or after a relaunch")
        func sendsOnce() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST /knowledge-bits/a/approve": .held(200, "{}")])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .approve)

            let first = Task { await queue.flush() }

            try await waitForHeld(1)
            await queue.flush()
            FakeServer.releaseHeld()
            await first.value
            await PendingDecisionQueue(fileURL: file, retryDelay: .zero).flush()

            #expect(FakeServer.writes.count == 1)
        }

        @Test("should survive app quit and flush on next launch")
        func survivesQuit() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST /knowledge-bits/a/reject": .failure(.notConnectedToInternet)])
            defer { session.end() }

            let before = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await before.enqueue(bitId: "a", kind: .reject)
            await before.flush()

            #expect(await before.count() == 1)

            FakeServer.start(["POST /knowledge-bits/a/reject": .json(200, #"{"ok":true,"feedbackId":"fb"}"#)])

            let after = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            #expect(await after.pendingIds().keys.contains("a"))

            await after.flush()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/reject"])
            #expect(await after.count() == 0)
        }

        @Test("should keep decisions for another server unsent")
        func keepsOtherServerDecisions() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession(["POST /knowledge-bits/a/approve": .json(200, "{}")])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .approve)
            APIClient.baseURLString = "https://other.postanki.test"
            await queue.flush()

            #expect(FakeServer.requested.isEmpty)
            #expect(await queue.pendingIds().isEmpty)

            APIClient.baseURLString = "https://\(FakeServer.host)"
            await queue.flush()

            #expect(FakeServer.writes.count == 1)
        }

        @Test("should send the kept questions and a note with the decision that carries them")
        func sendsKeepAndNote() async throws {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "POST /knowledge-bits/a/triage": .json(200, #"{"ok":true,"droppedVariantIds":["v2"]}"#),
                "POST /knowledge-bits/b/approve": .json(200, "{}"),
                "POST /knowledge-bits/b/grade": .json(200, #"{"ok":true}"#)
            ])
            defer { session.end() }

            let queue = PendingDecisionQueue(fileURL: file, retryDelay: .zero)

            _ = await queue.enqueue(bitId: "a", kind: .keep(["v1"]))
            _ = await queue.enqueue(bitId: "b", kind: .approve, note: "why")
            await queue.flush()

            let settled = await queue.takeSettled()

            #expect(settled.map(\.entry.bitId) == ["a", "b"])
            #expect(settled.first?.result == .sent(feedbackId: nil, dropped: ["v2"]))
            #expect(FakeServer.writes.map(\.path).prefix(2) == ["/knowledge-bits/a/triage", "/knowledge-bits/b/approve"])
        }
    }
}
