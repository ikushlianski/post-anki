import Foundation
import Testing
@testable import PostAnkiAPI

@Suite struct GoalStreakTests {
    @Test func decodesStreakIgnoringExtraFields() throws {
        let json = #"{"status":"active","current":4,"longest":9,"restDaysLeft":1,"pausedUntil":null,"comeback":false,"previousStreak":0,"activeDaysLast30":12}"#
        let streak = try JSONDecoder().decode(GoalStreak.self, from: Data(json.utf8))

        #expect(streak == GoalStreak(status: "active", current: 4, longest: 9))
    }

    @Test func summaryPluralizesDays() {
        #expect(GoalStreak(status: "active", current: 1, longest: 1).summaryText == "1 day streak")
        #expect(GoalStreak(status: "active", current: 4, longest: 9).summaryText == "4 days streak")
    }

    @Test func summaryHiddenWithoutRunningStreak() {
        #expect(GoalStreak(status: "broken", current: 0, longest: 9).summaryText == nil)
    }

    @Test func footnoteJoinsStreakAndGoal() {
        let goal = DailyGoalProgress(target: 20, doneToday: 7, dayEndsAt: "x")
        let streak = GoalStreak(status: "active", current: 4, longest: 9)

        #expect(GoalStreak.footnote(goal: goal, streak: streak) == "4 days streak · Today: 7 of 20")
        #expect(GoalStreak.footnote(goal: goal, streak: nil) == "Today: 7 of 20")
        #expect(GoalStreak.footnote(goal: nil, streak: streak) == "4 days streak")
        #expect(GoalStreak.footnote(goal: nil, streak: nil) == nil)
    }
}
