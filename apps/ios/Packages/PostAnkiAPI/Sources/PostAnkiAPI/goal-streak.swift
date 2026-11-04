import Foundation

public struct GoalStreak: Decodable, Sendable, Equatable {
    public let status: String
    public let current: Int
    public let longest: Int

    public init(status: String, current: Int, longest: Int) {
        self.status = status
        self.current = current
        self.longest = longest
    }

    public var summaryText: String? {
        guard current > 0 else { return nil }

        return "\(current) \(current == 1 ? "day" : "days") streak"
    }

    public static func footnote(goal: DailyGoalProgress?, streak: GoalStreak?) -> String? {
        let parts = [streak?.summaryText, goal?.summaryText].compactMap { $0 }

        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
