import AppKit
import Network

@MainActor
final class MacQueueFlushTrigger {
    static let shared = MacQueueFlushTrigger()

    private let monitor = NWPathMonitor()
    private var observer: NSObjectProtocol?
    private var wasOnline: Bool?
    private var isStarted = false

    func start() {
        guard !isStarted else { return }

        isStarted = true

        observer = NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in await PendingQueueFlusher.flushAll() }
        }

        monitor.pathUpdateHandler = { [weak self] path in
            let isOnline = path.status == .satisfied

            Task { @MainActor in self?.networkChanged(isOnline: isOnline) }
        }
        monitor.start(queue: DispatchQueue(label: "mac-queue-flush-network", qos: .utility))

        Task { await PendingQueueFlusher.flushAll() }
    }

    private func networkChanged(isOnline: Bool) {
        let regained = isOnline && wasOnline == false

        wasOnline = isOnline

        if regained {
            Task { await PendingQueueFlusher.flushAll() }
        }
    }
}
