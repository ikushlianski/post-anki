import Testing
@testable import PostAnkiAPI

@Suite("Chat follow-up queue")
struct ChatQueueFollowUpQueueTests {
    private func filled(_ count: Int) -> ChatQueueFollowUpQueue {
        var queue = ChatQueueFollowUpQueue()

        for index in 1...count { queue.enqueue("q\(index)", id: "id\(index)") }

        return queue
    }

    @Test("should refuse a fourth follow-up while three are waiting")
    func capsAtThree() {
        var queue = filled(3)

        #expect(queue.isFull)
        #expect(queue.enqueue("q4") == nil)
        #expect(queue.items.count == 3)
    }

    @Test("should send follow-ups in the order they were typed")
    func fifoOrder() {
        var queue = filled(3)
        var sent: [String] = []

        while let next = queue.beginNext() {
            sent.append(next.text)
            queue.complete(id: next.id)
        }

        #expect(sent == ["q1", "q2", "q3"])
        #expect(queue.isEmpty)
    }

    @Test("should never start a second request while one is sending")
    func noDoubleSend() {
        var queue = filled(2)

        #expect(queue.beginNext()?.id == "id1")
        #expect(queue.beginNext() == nil)

        queue.complete(id: "id1")

        #expect(queue.beginNext()?.id == "id2")
    }

    @Test("should hand every waiting text back in order when a terminal error stops the queue")
    func drainReturnsTexts() {
        var queue = filled(3)

        _ = queue.beginNext()

        #expect(queue.drainTexts() == ["q1", "q2", "q3"])
        #expect(queue.isEmpty)
    }

    @Test("should drop a cancelled follow-up and free its slot")
    func cancelRemoves() {
        var queue = filled(3)

        queue.cancel(id: "id2")

        #expect(queue.items.map(\.id) == ["id1", "id3"])
        #expect(!queue.isFull)
    }

    @Test("should not cancel a follow-up that is already being sent")
    func cancelIgnoresSending() {
        var queue = filled(1)

        _ = queue.beginNext()
        queue.cancel(id: "id1")

        #expect(queue.items.count == 1)
    }

    @Test("should keep a failed follow-up and reuse its id when retried")
    func failedRetryKeepsId() {
        var queue = filled(2)

        _ = queue.beginNext()
        queue.fail(id: "id1")

        #expect(queue.beginNext()?.id == "id2")

        queue.complete(id: "id2")

        #expect(queue.beginNext() == nil)
        let retried = queue.retryFailed(id: "id1")

        #expect(retried)
        #expect(queue.beginNext()?.id == "id1")
    }

    @Test("should ignore blank follow-ups")
    func ignoresBlank() {
        var queue = ChatQueueFollowUpQueue()

        #expect(queue.enqueue("  \n") == nil)
    }
}
