import Observation
import PostAnkiAPI
#if os(iOS)
import UIKit
#else
import AppKit
#endif

@Observable
@MainActor
final class PendingReviewCountStore {
    static let shared = PendingReviewCountStore()

    private(set) var count = 0

    @ObservationIgnored private var isRefreshing = false
    @ObservationIgnored private var mutations = 0

    private init() {
        Task { await refresh() }

        #if os(iOS)
        let didBecomeActive = UIApplication.didBecomeActiveNotification
        #else
        let didBecomeActive = NSApplication.didBecomeActiveNotification
        #endif

        NotificationCenter.default.addObserver(
            forName: didBecomeActive,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in await PendingReviewCountStore.shared.refresh() }
        }
    }

    func refresh() async {
        guard !isRefreshing else { return }

        isRefreshing = true
        defer { isRefreshing = false }

        for _ in 0..<2 {
            let before = mutations

            guard let value = try? await APIClient.pendingReviewCount() else { return }

            if before == mutations {
                count = max(0, value)

                return
            }
        }
    }

    func adjust(by delta: Int) {
        mutations += 1
        count = max(0, count + delta)
    }
}
