import Foundation

public struct RefreshThrottle {
    public let interval: TimeInterval
    private let clock: () -> Date
    private var lastRun: Date?

    public init(interval: TimeInterval = 10, clock: @escaping () -> Date = Date.init) {
        self.interval = interval
        self.clock = clock
    }

    public mutating func shouldRun() -> Bool {
        let now = clock()

        if let lastRun, now.timeIntervalSince(lastRun) < interval { return false }

        lastRun = now

        return true
    }
}
