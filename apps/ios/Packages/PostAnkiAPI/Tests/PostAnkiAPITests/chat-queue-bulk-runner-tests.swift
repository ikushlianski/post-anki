import Testing
@testable import PostAnkiAPI

@MainActor
private final class Probe {
    var active = 0
    var peak = 0
    var failIds: Set<String> = []

    func perform(_ id: String) async -> Bool {
        active += 1
        peak = max(peak, active)

        for _ in 0..<5 { await Task.yield() }

        active -= 1

        return !failIds.contains(id)
    }
}

@MainActor
@Suite("Chat queue bulk runner")
struct ChatQueueBulkRunnerTests {
    @Test("never runs more than three moves at once and finishes every card")
    func concurrencyCap() async {
        let probe = Probe()
        let ids = (1...10).map(String.init)
        let result = await ChatQueueBulkRunner.run(ids: ids) { await probe.perform($0) }

        #expect(probe.peak == 3)
        #expect(Set(result.succeeded) == Set(ids))
        #expect(result.failed.isEmpty)
    }

    @Test("a failed card is reported without stopping the others")
    func partialFailure() async {
        let probe = Probe()

        probe.failIds = ["2", "4"]

        let result = await ChatQueueBulkRunner.run(ids: ["1", "2", "3", "4", "5"]) { await probe.perform($0) }

        #expect(Set(result.failed) == ["2", "4"])
        #expect(Set(result.succeeded) == ["1", "3", "5"])
    }

    @Test("an empty selection does nothing")
    func empty() async {
        let result = await ChatQueueBulkRunner.run(ids: []) { _ in true }

        #expect(result == ChatQueueBulkResult(succeeded: [], failed: []))
    }

    @Test("more than five selected cards need confirmation, five or fewer do not")
    func confirmThreshold() {
        #expect(!ChatQueueBulkRunner.needsConfirm(count: 5))
        #expect(ChatQueueBulkRunner.needsConfirm(count: 6))
    }

    @Test("the notice counts failed cards and is absent when none failed")
    func notice() {
        #expect(ChatQueueBulkRunner.notice(failed: 0) == nil)
        #expect(ChatQueueBulkRunner.notice(failed: 1) == "1 card could not be moved")
        #expect(ChatQueueBulkRunner.notice(failed: 3) == "3 cards could not be moved")
    }
}
