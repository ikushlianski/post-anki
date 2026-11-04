import Foundation

public struct DailyGoalProgress: Decodable, Sendable, Equatable {
    public let target: Int?
    public let doneToday: Int
    public let dayEndsAt: String

    public init(target: Int?, doneToday: Int, dayEndsAt: String) {
        self.target = target
        self.doneToday = doneToday
        self.dayEndsAt = dayEndsAt
    }

    public var summaryText: String? {
        guard let target else { return nil }

        let base = "Today: \(doneToday) of \(target)"

        return doneToday >= target ? base + " · goal met" : base
    }
}
