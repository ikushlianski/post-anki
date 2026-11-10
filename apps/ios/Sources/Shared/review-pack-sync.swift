import Foundation
import Network
import PostAnkiAPI
#if os(iOS)
import UIKit
#endif

enum ReviewPackRefreshReason: Sendable {
    case opened
    case timer
    case backgrounded
    case networkRegained
    case backgroundTask
}

@MainActor
final class ReviewPackSync {
    static let shared = ReviewPackSync()
    static let interval: Duration = .seconds(360)

    private(set) var isOnline = true
    private(set) var lastRefreshFailed = false

    private let store: ReviewPackStore
    private let fetch: @Sendable () async throws -> ReviewPack
    private let flush: @Sendable () async -> Void
    private let hasSession: @Sendable () -> Bool
    private let interval: Duration
    static let minimumGap: TimeInterval = 60

    private var isRefreshing = false
    private var lastSuccess: Date?
    private var isSuspended = false
    private var loop: Task<Void, Never>?
    private var monitor: NWPathMonitor?
    private var settingsObserver: NSObjectProtocol?

    init(
        store: ReviewPackStore = .shared,
        interval: Duration = ReviewPackSync.interval,
        fetch: @escaping @Sendable () async throws -> ReviewPack = { try await APIClient.reviewPack(tz: TimeZone.current.identifier) },
        flush: @escaping @Sendable () async -> Void = { await PendingQueueFlusher.flushAll() },
        hasSession: @escaping @Sendable () -> Bool = { !SignInGate.needsSignIn(token: TokenStore.read()) }
    ) {
        self.store = store
        self.interval = interval
        self.fetch = fetch
        self.flush = flush
        self.hasSession = hasSession
    }

    func start() {
        guard monitor == nil else { return }

        let monitor = NWPathMonitor()

        self.monitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied

            Task { @MainActor in self?.networkChanged(isOnline: online) }
        }
        monitor.start(queue: DispatchQueue(label: "review-pack-network", qos: .utility))

        settingsObserver = NotificationCenter.default.addObserver(
            forName: .postAnkiSettingsDidSave,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.settingsSaved() }
        }
    }

    func appBecameActive() {
        isSuspended = false
        start()
        startLoop()
        Task { await refresh(.opened) }
    }

    func appWentToBackground() {
        loop?.cancel()
        loop = nil

        #if os(iOS)
        let work = ReviewPackBackgroundWork()
        let refreshing = Task { await refresh(.backgrounded) }

        work.begin { refreshing.cancel() }

        Task {
            await refreshing.value
            work.end()
        }
        #else
        Task { await refresh(.backgrounded) }
        #endif
    }

    func signedOut() {
        isSuspended = true
        loop?.cancel()
        loop = nil
    }

    @discardableResult
    func refresh(_ reason: ReviewPackRefreshReason) async -> Bool {
        guard !isRefreshing, !isSuspended, hasSession() else { return false }

        let bypassesThrottle = reason == .timer || reason == .networkRegained || reason == .backgroundTask

        if !bypassesThrottle, let lastSuccess, Date().timeIntervalSince(lastSuccess) < Self.minimumGap {
            await flush()

            return false
        }

        isRefreshing = true
        defer { isRefreshing = false }

        await flush()

        let startedAt = Date()

        do {
            let pack = try await fetch()

            guard !isSuspended, !Task.isCancelled else { return false }

            let saved = await store.replace(pack, fetchStartedAt: startedAt)

            lastRefreshFailed = !saved

            if saved { lastSuccess = Date() }

            return saved
        } catch {
            lastRefreshFailed = true

            return false
        }
    }

    private func startLoop() {
        guard loop == nil else { return }

        let wait = interval

        loop = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: wait)

                guard !Task.isCancelled else { return }

                await self?.refresh(.timer)
            }
        }
    }

    private func settingsSaved() {
        guard hasSession() else { return }

        appBecameActive()
    }

    private func networkChanged(isOnline online: Bool) {
        let regained = online && !isOnline

        isOnline = online

        if regained {
            Task { await refresh(.networkRegained) }
        }
    }
}

#if os(iOS)
@MainActor
private final class ReviewPackBackgroundWork {
    private var identifier = UIBackgroundTaskIdentifier.invalid

    func begin(onExpiry: @escaping @MainActor @Sendable () -> Void) {
        identifier = UIApplication.shared.beginBackgroundTask(withName: "review-pack-refresh") { [weak self] in
            onExpiry()
            self?.end()
        }
    }

    func end() {
        guard identifier != .invalid else { return }

        UIApplication.shared.endBackgroundTask(identifier)
        identifier = .invalid
    }
}
#endif
