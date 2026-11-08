import Foundation

public struct ChatQueueBulkResult: Equatable, Sendable {
    public let succeeded: [String]
    public let failed: [String]

    public init(succeeded: [String], failed: [String]) {
        self.succeeded = succeeded
        self.failed = failed
    }
}

public enum ChatQueueBulkRunner {
    public static let concurrency = 3
    public static let confirmThreshold = 5

    public static func needsConfirm(count: Int) -> Bool {
        count > confirmThreshold
    }

    public static func notice(failed: Int) -> String? {
        guard failed > 0 else { return nil }

        return "\(failed) \(failed == 1 ? "card" : "cards") could not be moved"
    }

    @MainActor
    public static func run(
        ids: [String],
        concurrency: Int = ChatQueueBulkRunner.concurrency,
        perform: @escaping @MainActor (String) async -> Bool
    ) async -> ChatQueueBulkResult {
        let state = RunState(ids: ids)

        let workers = (0..<min(max(1, concurrency), ids.count)).map { _ in
            Task { @MainActor in
                while let id = state.next() {
                    state.record(id, ok: await perform(id))
                }
            }
        }

        for worker in workers { await worker.value }

        return ChatQueueBulkResult(succeeded: state.succeeded, failed: state.failed)
    }

    @MainActor
    private final class RunState {
        let ids: [String]
        var index = 0
        var succeeded: [String] = []
        var failed: [String] = []

        init(ids: [String]) { self.ids = ids }

        func next() -> String? {
            guard index < ids.count else { return nil }

            defer { index += 1 }

            return ids[index]
        }

        func record(_ id: String, ok: Bool) {
            if ok { succeeded.append(id) } else { failed.append(id) }
        }
    }
}
