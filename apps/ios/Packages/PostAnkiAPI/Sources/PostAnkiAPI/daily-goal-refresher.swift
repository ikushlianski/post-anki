import Foundation

public struct DailyGoalSnapshot: Sendable, Equatable {
    public let goal: DailyGoalProgress?
    public let streak: GoalStreak?

    public init(goal: DailyGoalProgress?, streak: GoalStreak?) {
        self.goal = goal
        self.streak = streak
    }
}

@MainActor
public final class DailyGoalRefresher {
    public typealias GoalFetch = @Sendable () async throws -> DailyGoalProgress
    public typealias StreakFetch = @Sendable () async throws -> GoalStreak

    private let fetchGoal: GoalFetch
    private let fetchStreak: StreakFetch
    private var requestCount = 0

    public init(fetchGoal: @escaping GoalFetch, fetchStreak: @escaping StreakFetch) {
        self.fetchGoal = fetchGoal
        self.fetchStreak = fetchStreak
    }

    public static func live() -> DailyGoalRefresher {
        DailyGoalRefresher(
            fetchGoal: { try await APIClient.dailyGoalProgress() },
            fetchStreak: { try await APIClient.goalStreak() }
        )
    }

    public func refresh() async -> DailyGoalSnapshot? {
        requestCount += 1

        let ticket = requestCount
        let goalFetch = fetchGoal
        let streakFetch = fetchStreak
        async let progressResult = try? goalFetch()
        async let streakResult = try? streakFetch()

        let progress = await progressResult
        let streak = await streakResult

        guard ticket == requestCount else { return nil }

        return DailyGoalSnapshot(goal: progress, streak: streak)
    }
}
