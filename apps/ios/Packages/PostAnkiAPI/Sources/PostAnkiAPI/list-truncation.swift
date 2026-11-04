public struct ListTruncation: Equatable, Sendable {
    public let shown: Int
    public let total: Int

    public var message: String { "Showing the first \(shown) of \(total) cards" }

    public static func make(shown: Int, hasMore: Bool?, total: Int?) -> ListTruncation? {
        guard hasMore == true, let total else { return nil }

        return ListTruncation(shown: shown, total: total)
    }
}

public struct TruncationTracker: Equatable, Sendable {
    private var total: Int?

    public init(_ list: ListTruncation? = nil) {
        total = list?.total
    }

    public mutating func removedOne() {
        guard let current = total else { return }

        total = max(0, current - 1)
    }

    public func truncation(shown: Int) -> ListTruncation? {
        guard let total, total > shown else { return nil }

        return ListTruncation(shown: shown, total: total)
    }
}
