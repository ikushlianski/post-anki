import Foundation

@MainActor
final class DecisionDrainer {
    let queue: PendingDecisionQueue
    var onSettled: ([SettledDecision]) -> Void = { _ in }
    var onFailure: (SaveFailure) -> Void = { _ in }

    private var task: Task<Void, Never>?
    private var again = false

    init(queue: PendingDecisionQueue) {
        self.queue = queue
    }

    func start() {
        guard task == nil else {
            again = true

            return
        }

        task = Task { [weak self] in await self?.run() }
    }

    func settle() async {
        while let current = task { await current.value }
    }

    private func run() async {
        repeat {
            again = false
            await queue.flush()

            let settled = await queue.takeSettled()

            if !settled.isEmpty { onSettled(settled) }

            if let failure = await queue.failure { onFailure(failure) }
        } while again

        task = nil
    }
}
