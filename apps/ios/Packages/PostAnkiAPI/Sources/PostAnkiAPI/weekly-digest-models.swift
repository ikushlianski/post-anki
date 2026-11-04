import Foundation

public struct WeeklyDigestCounts: Decodable, Sendable, Hashable {
    public let accepted: Int
    public let rejected: Int
    public let reviewed: Int

    public init(accepted: Int = 0, rejected: Int = 0, reviewed: Int = 0) {
        self.accepted = accepted
        self.rejected = rejected
        self.reviewed = reviewed
    }

    private enum CodingKeys: String, CodingKey {
        case accepted, rejected, reviewed
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        accepted = max(0, (try? container.decodeIfPresent(Int.self, forKey: .accepted)) ?? 0)
        rejected = max(0, (try? container.decodeIfPresent(Int.self, forKey: .rejected)) ?? 0)
        reviewed = max(0, (try? container.decodeIfPresent(Int.self, forKey: .reviewed)) ?? 0)
    }
}

public struct WeeklyDigestRejectReason: Decodable, Sendable, Hashable {
    public let reason: String
    public let count: Int
    public let delta: Int?

    public init(reason: String, count: Int, delta: Int? = nil) {
        self.reason = reason
        self.count = count
        self.delta = delta
    }

    public var label: String { RejectedCardReason.label(forCode: reason) }

    public var deltaText: String? {
        guard let delta, delta != 0 else { return nil }

        return delta > 0 ? "+\(delta)" : "\(delta)"
    }

    private enum CodingKeys: String, CodingKey {
        case reason, count, delta
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        reason = try container.decode(String.self, forKey: .reason)
        count = max(0, try container.decode(Int.self, forKey: .count))
        delta = (try? container.decodeIfPresent(Int.self, forKey: .delta)).flatMap { $0 }
    }
}

public struct WeeklyDigestSummary: Decodable, Sendable, Hashable {
    public let current: WeeklyDigestCounts
    public let previous: WeeklyDigestCounts
    public let chatBacklog: Int
    public let chatCards: Int?
    public let chatTurns: Int?
    public let topRejectReasons: [WeeklyDigestRejectReason]

    public init(
        current: WeeklyDigestCounts,
        previous: WeeklyDigestCounts,
        chatBacklog: Int,
        chatCards: Int? = nil,
        chatTurns: Int? = nil,
        topRejectReasons: [WeeklyDigestRejectReason] = []
    ) {
        self.current = current
        self.previous = previous
        self.chatBacklog = chatBacklog
        self.chatCards = chatCards
        self.chatTurns = chatTurns
        self.topRejectReasons = topRejectReasons
    }

    public var chatActivityLine: String? {
        let turns = chatTurns ?? 0

        guard turns > 0 else { return nil }

        let cards = chatCards ?? 0

        return "Chat: \(cards) \(cards == 1 ? "card" : "cards"), \(turns) \(turns == 1 ? "turn" : "turns") this week"
    }

    private enum CodingKeys: String, CodingKey {
        case current, previous, chatBacklog, chatCards, chatTurns, topRejectReasons
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        current = (try? container.decodeIfPresent(WeeklyDigestCounts.self, forKey: .current)) ?? WeeklyDigestCounts()
        previous = (try? container.decodeIfPresent(WeeklyDigestCounts.self, forKey: .previous)) ?? WeeklyDigestCounts()
        chatBacklog = max(0, (try? container.decodeIfPresent(Int.self, forKey: .chatBacklog)) ?? 0)
        chatCards = (try? container.decodeIfPresent(Int.self, forKey: .chatCards)).flatMap { $0 }.map { max(0, $0) }
        chatTurns = (try? container.decodeIfPresent(Int.self, forKey: .chatTurns)).flatMap { $0 }.map { max(0, $0) }
        topRejectReasons = Self.decodeReasons(container)
    }

    private static func decodeReasons(_ container: KeyedDecodingContainer<CodingKeys>) -> [WeeklyDigestRejectReason] {
        guard var list = try? container.nestedUnkeyedContainer(forKey: .topRejectReasons) else { return [] }

        var reasons: [WeeklyDigestRejectReason] = []

        while !list.isAtEnd {
            if let item = try? list.decode(WeeklyDigestRejectReason.self) {
                reasons.append(item)
            } else {
                _ = try? list.decode(DiscardedValue.self)
            }
        }

        return reasons
    }

    private struct DiscardedValue: Decodable {}
}

public enum WeeklyDigestDelta {
    public static func line(current: Int, previous: Int) -> String? {
        previous == 0 ? nil : text(current: current, previous: previous)
    }

    public static func text(current: Int, previous: Int) -> String {
        if current > previous { return "Up \(current - previous) from last week" }

        if current < previous { return "Down \(previous - current) from last week" }

        return "Same as last week"
    }
}

public enum WeeklyDigestFailure: Sendable, Equatable, Error {
    case offline
    case unauthorized
    case other

    public static func failure(for error: Error) -> WeeklyDigestFailure {
        if let failure = error as? WeeklyDigestFailure { return failure }

        switch ChatQueueFailure.failure(for: error) {
        case .offline: return .offline
        case .unauthorized: return .unauthorized
        default: return .other
        }
    }
}
