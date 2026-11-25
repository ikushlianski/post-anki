import Foundation

@MainActor
final class SerialWriteQueue {
    private var tail: Task<Void, Never>?
    private var pending = 0

    var onIdle: (@MainActor () async -> Void)?

    var isIdle: Bool { pending == 0 }

    func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let previous = tail

        pending += 1
        tail = Task { [weak self] in
            await previous?.value
            await work()
            self?.pending -= 1

            if let self, self.pending == 0 { await self.onIdle?() }
        }
    }

    func settle() async {
        while pending > 0, let task = tail { await task.value }
    }
}
