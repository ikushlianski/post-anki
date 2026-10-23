import Foundation
import PostAnkiAPI
import Testing

enum HeldReply: Sendable {
    case record
    case offline
}

final class HoldingServer: URLProtocol, @unchecked Sendable {
    static let host = "holding.postanki.test"

    private static let lock = NSLock()
    nonisolated(unsafe) private static var replies: [HeldReply] = []
    nonisolated(unsafe) private static var holdFirst = false
    nonisolated(unsafe) private static var gate = DispatchSemaphore(value: 0)
    nonisolated(unsafe) private static var served = 0

    static func start(_ replies: [HeldReply], holdFirst: Bool) {
        lock.withLock {
            self.replies = replies
            self.holdFirst = holdFirst
            gate = DispatchSemaphore(value: 0)
            served = 0
        }

        URLProtocol.registerClass(HoldingServer.self)
        APIClient.useProtocolClasses([HoldingServer.self])
    }

    static func stop() {
        URLProtocol.unregisterClass(HoldingServer.self)
        APIClient.useProtocolClasses([])
    }

    static func release() {
        lock.withLock { gate }.signal()
    }

    static var requestCount: Int { lock.withLock { served } }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == host
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }

        let (reply, shouldHold, gate) = Self.lock.withLock { () -> (HeldReply, Bool, DispatchSemaphore) in
            let index = Self.served
            Self.served += 1

            return (index < Self.replies.count ? Self.replies[index] : .offline, index == 0 && Self.holdFirst, Self.gate)
        }

        DispatchQueue.global().async {
            if shouldHold { gate.wait() }

            switch reply {
            case .offline:
                self.client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
            case .record:
                let body = (try? SmokeFixture.data("record-review")) ?? Data("{}".utf8)
                let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)

                if let response {
                    self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                }

                self.client?.urlProtocol(self, didLoad: body)
                self.client?.urlProtocolDidFinishLoading(self)
            }
        }
    }

    override func stopLoading() {}
}

extension SmokeTests {
    @Suite("Undo while a queued grade is being sent")
    struct ScheduledReviewInFlightSmokeTests {
        private func waitForFirstRequest() async throws {
            for _ in 0..<300 where HoldingServer.requestCount == 0 {
                try await Task.sleep(for: .milliseconds(10))
            }

            #expect(HoldingServer.requestCount > 0)
        }

        private func start(_ replies: [HeldReply]) -> String? {
            let saved = UserDefaults.standard.string(forKey: "apiBaseURL")

            UserDefaults.standard.set("https://\(HoldingServer.host)", forKey: "apiBaseURL")
            HoldingServer.start(replies, holdFirst: true)

            return saved
        }

        private func stop(restoring saved: String?) {
            HoldingServer.stop()

            if let saved {
                UserDefaults.standard.set(saved, forKey: "apiBaseURL")
            } else {
                UserDefaults.standard.removeObject(forKey: "apiBaseURL")
            }
        }

        private func makeQueue() -> (PendingGradeQueue, URL) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("held-\(UUID().uuidString).json")

            return (PendingGradeQueue(fileURL: file), file)
        }

        private let input = RecordReviewInput(variantId: "v1", grade: .good, durationMs: 10, requestId: "r1")

        @Test("should report the review as sent when undo cancels a send that still reaches the server")
        func undoWhileInFlightThatSucceeds() async throws {
            let (queue, file) = makeQueue()
            defer { try? FileManager.default.removeItem(at: file) }

            let saved = start([.offline, .record])
            defer { stop(restoring: saved) }

            await queue.enqueue(input, knowledgeBitId: "kb_01")

            let flush = Task { await queue.flush() }

            try await waitForFirstRequest()

            guard case .cancelledInFlight = await queue.remove(requestId: "r1") else {
                Issue.record("expected the grade to be in flight")
                HoldingServer.release()

                return
            }

            let outcome = Task { await queue.cancelledSendOutcome(requestId: "r1") }

            HoldingServer.release()
            await flush.value

            #expect(await outcome.value == .sent(reviewId: "rev_01"))
            #expect(await queue.count() == 0)
        }

        @Test("should leave the grade unconfirmed when the cancelled send cannot be confirmed, then resolve it on retry")
        func undoAfterUnconfirmedSend() async throws {
            let (queue, file) = makeQueue()
            defer { try? FileManager.default.removeItem(at: file) }

            let saved = start([.offline, .offline, .record])
            defer { stop(restoring: saved) }

            await queue.enqueue(input, knowledgeBitId: "kb_01")

            let flush = Task { await queue.flush() }

            try await waitForFirstRequest()
            _ = await queue.remove(requestId: "r1")

            let outcome = Task { await queue.cancelledSendOutcome(requestId: "r1") }

            HoldingServer.release()
            await flush.value

            #expect(await outcome.value == .unconfirmed)
            #expect(await queue.count() == 1)

            guard case .sent(let reviewId) = await queue.remove(requestId: "r1") else {
                Issue.record("expected the retried send to confirm")

                return
            }

            #expect(reviewId == "rev_01")
            #expect(await queue.count() == 0)
        }
    }
}
