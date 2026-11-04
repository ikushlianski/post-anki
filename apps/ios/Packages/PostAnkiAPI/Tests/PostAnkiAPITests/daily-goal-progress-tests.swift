import Foundation
import Testing
@testable import PostAnkiAPI

@Suite struct DailyGoalProgressTests {
    private func decode(_ json: String) throws -> DailyGoalProgress {
        try JSONDecoder().decode(DailyGoalProgress.self, from: Data(json.utf8))
    }

    @Test func decodesTargetAndProgress() throws {
        let progress = try decode(#"{"target":20,"doneToday":7,"dayEndsAt":"2026-10-29T22:00:00.000Z"}"#)

        #expect(progress == DailyGoalProgress(target: 20, doneToday: 7, dayEndsAt: "2026-10-29T22:00:00.000Z"))
    }

    @Test func decodesNullTarget() throws {
        let progress = try decode(#"{"target":null,"doneToday":3,"dayEndsAt":"x"}"#)

        #expect(progress.target == nil)
    }

    @Test func summaryShowsDoneOfTarget() {
        #expect(DailyGoalProgress(target: 20, doneToday: 7, dayEndsAt: "x").summaryText == "Today: 7 of 20")
    }

    @Test func summaryMarksGoalMetAtOrAboveTarget() {
        #expect(DailyGoalProgress(target: 5, doneToday: 5, dayEndsAt: "x").summaryText == "Today: 5 of 5 · goal met")
        #expect(DailyGoalProgress(target: 5, doneToday: 8, dayEndsAt: "x").summaryText == "Today: 8 of 5 · goal met")
    }

    @Test func summaryIsHiddenWithoutTarget() {
        #expect(DailyGoalProgress(target: nil, doneToday: 3, dayEndsAt: "x").summaryText == nil)
    }

    @Test func pathCarriesEncodedTimeZone() {
        #expect(APIClient.dailyGoalProgressPath(tz: "Europe/Warsaw") == "/study-goal/daily/progress?tz=Europe%2FWarsaw")
    }
}
