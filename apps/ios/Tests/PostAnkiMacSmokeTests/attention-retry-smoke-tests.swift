import PostAnkiAPI
import Testing

private actor RetryLog {
    var started: [String] = []
    var texts: [String?] = []
    var active = 0
    var peak = 0
    var failStart: Set<String> = []
    var statuses: [String: [AttentionRetryStatus]] = [:]

    func failStarts(_ ids: Set<String>) { failStart = ids }

    func script(_ id: String, _ list: [AttentionRetryStatus]) { statuses[id] = list }

    func begin(_ id: String, _ text: String?) throws {
        if failStart.contains(id) { throw APIError.badStatus(500, nil) }

        started.append(id)
        texts.append(text)
        active += 1
        peak = max(peak, active)
    }

    func next(_ id: String) -> AttentionRetryStatus {
        var list = statuses[id] ?? [.done]
        let value = list.removeFirst()

        statuses[id] = list.isEmpty ? [value] : list

        if value != .running { active -= 1 }

        return value
    }
}

extension SmokeTests {
    @Suite("Attention retry coordinator")
    @MainActor
    struct AttentionRetrySmokeTests {
        private func make(_ log: RetryLog, finished: @escaping @MainActor () async -> Void = {}) -> AttentionRetryCoordinator {
            AttentionRetryCoordinator(
                gateway: AttentionRetryGateway(
                    start: { id, text in try await log.begin(id, text) },
                    status: { id in await log.next(id) },
                    sleep: { await Task.yield() }
                ),
                onFinished: finished
            )
        }

        @Test("should send the edited text with a single retry and clear the retrying state once it finishes")
        func singleRetryWithText() async {
            let log = RetryLog()
            let coordinator = make(log)

            await coordinator.retry("a", text: "fixed")

            #expect(await log.texts == ["fixed"])
            #expect(coordinator.phases["a"] == nil)
        }

        @Test("should show the plain reason when a retry fails again")
        func failureShowsReason() async {
            let log = RetryLog()

            await log.script("a", [.running, .failed(reason: "source_empty")])

            let coordinator = make(log)

            await coordinator.retry("a")

            #expect(coordinator.phases["a"] == .failed("This note has no text."))
        }

        @Test("should never run more than three retries at once in Retry all")
        func capsConcurrency() async {
            let log = RetryLog()

            for id in ["1", "2", "3", "4", "5"] { await log.script(id, [.running, .running, .done]) }

            let coordinator = make(log)

            await coordinator.retryAll(["1", "2", "3", "4", "5"])

            #expect(await log.started.count == 5)
            #expect(await log.peak <= AttentionRetryCoordinator.maxConcurrent)
            #expect(coordinator.phases.isEmpty)
        }

        @Test("should report how many notes could not start and still retry the others")
        func partialFailure() async {
            let log = RetryLog()

            await log.failStarts(["2", "4"])

            let coordinator = make(log)

            await coordinator.retryAll(["1", "2", "3", "4", "5"])

            #expect(await log.started.sorted() == ["1", "3", "5"])
            #expect(coordinator.batchMessage == "2 of 5 could not start. Try again.")
        }

        @Test("should reload the list once after Retry all and not at all when nothing could start")
        func reloadsOnce() async {
            let log = RetryLog()
            var reloads = 0
            let coordinator = make(log) { reloads += 1 }

            await coordinator.retryAll(["1", "2"])

            #expect(reloads == 1)

            await log.failStarts(["3"])
            await coordinator.retryAll(["3"])

            #expect(reloads == 1)
        }

        @Test("should give up after the poll limit with a calm message")
        func timesOut() async {
            let log = RetryLog()

            await log.script("a", [.running])

            let coordinator = make(log)

            await coordinator.retry("a")

            #expect(coordinator.phases["a"] == .failed(AttentionRetryCoordinator.timedOutMessage))
        }
    }
}
