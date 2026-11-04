import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func refreshDailyGoal() async {
        guard let snapshot = await dailyGoalRefresher.refresh() else { return }

        dailyGoal = snapshot.goal
        goalStreak = snapshot.streak
    }

    func refreshDailyGoalInBackground() {
        Task { await refreshDailyGoal() }
    }
}
