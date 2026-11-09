import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class MacUpdateChecker {
    enum State: Equatable {
        case idle
        case checking
        case available(MacUpdateRelease)
        case downloading
        case failed(String)
    }

    static let shared = MacUpdateChecker()

    private(set) var state = State.idle
    private(set) var upToDate = false
    private(set) var dismissedTag: String?
    private var lastCheck: Date?
    private var started = false

    static var isEnabled: Bool {
        #if DEBUG
        return false
        #else
        return !MacMenuBar.isHostingTests && !Bundle.main.bundlePath.contains("/Build/Products/")
        #endif
    }

    var current: MacUpdateVersion? {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String).flatMap { MacUpdateVersion(tag: $0) }
    }

    var available: MacUpdateRelease? {
        if case .available(let release) = state { return release }

        return nil
    }

    var bannerRelease: MacUpdateRelease? {
        guard let release = available, release.tag != dismissedTag else { return nil }

        return release
    }

    func dismiss() { dismissedTag = available?.tag }

    func start() {
        guard Self.isEnabled, !started else { return }

        started = true

        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in
                let stale = self.lastCheck.map { Date().timeIntervalSince($0) > 3600 } ?? true

                if stale { await self.check(manual: false) }
            }
        }

        Task {
            while !Task.isCancelled {
                await check(manual: false)
                try? await Task.sleep(for: .seconds(3600))
            }
        }
    }

    func check(manual: Bool) async {
        guard Self.isEnabled || manual, let current, state != .checking, state != .downloading else { return }

        state = .checking
        upToDate = false
        lastCheck = Date()

        var request = URLRequest(url: MacUpdateReleaseFeed.url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("PostAnkiMac", forHTTPHeaderField: "User-Agent")

        do {
            let (data, _) = try await URLSession.shared.data(for: request)

            if let release = try MacUpdateReleaseFeed.newest(from: data), release.version > current {
                state = .available(release)
            } else {
                state = .idle
                upToDate = true
            }
        } catch {
            state = manual ? .failed("Couldn't check for updates.") : .idle
        }
    }

    func install() async {
        guard let release = available, let current else { return }

        state = .downloading

        do {
            if let message = try await MacUpdateInstaller.install(release, current: current) {
                state = .failed(message)
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
