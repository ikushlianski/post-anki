import Foundation

public struct RejectedSelection: Equatable, Sendable {
    public private(set) var ids: Set<String> = []
    public private(set) var failedIds: Set<String> = []

    public init() {}

    public var count: Int { ids.count }

    public var isEmpty: Bool { ids.isEmpty }

    public func contains(_ id: String) -> Bool { ids.contains(id) }

    public mutating func toggle(_ id: String) {
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
    }

    public mutating func selectAll(_ visible: [String]) {
        ids = Set(visible)
    }

    public mutating func clear() {
        ids = []
        failedIds = []
    }

    public mutating func keepOnly(_ visible: [String]) {
        ids.formIntersection(visible)
        failedIds.formIntersection(visible)
    }

    public mutating func clearFailed(_ retried: [String]) {
        failedIds.subtract(retried)
    }

    public mutating func markFailed(_ failed: [String]) {
        failedIds.formUnion(failed)
    }

    public func hasFailed(_ id: String) -> Bool { failedIds.contains(id) }

    public func orderedIds(in visible: [String]) -> [String] {
        visible.filter { ids.contains($0) }
    }

    public func allSelected(in visible: [String]) -> Bool {
        !visible.isEmpty && visible.allSatisfy { ids.contains($0) }
    }

    public func buttonTitle(isRunning: Bool) -> String {
        isRunning ? "Restoring…" : "Restore selected (\(count))"
    }
}

public struct RejectedBulkRestoreResult: Equatable, Sendable {
    public let removed: [String]
    public let failed: [String]
    public let stale: Bool

    public static let concurrency = 3

    public init(outcomes: [(id: String, outcome: RejectedCardRestoreOutcome)]) {
        var removed: [String] = []
        var failed: [String] = []
        var stale = false

        for entry in outcomes {
            switch entry.outcome {
            case .restored, .alreadyGone: removed.append(entry.id)
            case .notRejected: stale = true
            case .failed: failed.append(entry.id)
            }
        }

        self.removed = removed
        self.failed = failed
        self.stale = stale
    }

    public var restoredAny: Bool { !removed.isEmpty }

    public func message(failedPreviews: [String]) -> String? {
        var parts: [String] = []

        if !failed.isEmpty {
            let list = failedPreviews.prefix(3).map { "\"\($0)\"" }.joined(separator: ", ")
            let more = failed.count > 3 ? " and \(failed.count - 3) more" : ""

            parts.append("Couldn't restore \(failed.count) \(failed.count == 1 ? "card" : "cards"): \(list)\(more). They stay selected.")
        }

        if stale { parts.append("Some cards are no longer rejected. List refreshed.") }

        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    public var announcement: String? {
        guard !removed.isEmpty else { return nil }

        return "\(removed.count) \(removed.count == 1 ? "card" : "cards") restored"
    }
}
