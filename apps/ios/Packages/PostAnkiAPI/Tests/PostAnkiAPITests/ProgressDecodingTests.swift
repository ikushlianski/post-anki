import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Progress and home")
struct ProgressDecodingTests {
    @Test("should decode the home summary with top subjects and fun stats")
    func decodesHomeSummary() throws {
        let summary = try Fixture.decode(HomeSummary.self, "home-summary")

        #expect(summary.topSubjects.map(\.subjectName) == ["System design", "Spanish"])
        #expect(summary.topSubjects[0].topicsTouchedLast30Days == 6)
        #expect(summary.funStats.longestStreak == 19)
        #expect(summary.funStats.questionsAnswered == 842)
    }

    @Test("should decode a streak and treat a missing last active date as not active today")
    func decodesStreak() throws {
        let active = try Fixture.decode(Streak.self, "streak")
        let never = try Fixture.decode(Streak.self, "streak-never-active")

        #expect(active.currentStreak == 4)
        #expect(active.lastActiveDate == "2026-10-22")
        #expect(never.lastActiveDate == nil)
        #expect(never.isActiveToday == false)
    }

    @Test("should decode the weekly digest and average coverage across areas")
    func decodesWeeklyDigest() throws {
        let digest = try Fixture.decode(WeeklyDigest.self, "weekly-digest")

        #expect(digest.windowDays == 7)
        #expect(digest.coverage.map(\.status) == ["progress", "gap"])
        #expect(digest.averageCoverage == 52)
        #expect(digest.retention?.percentText == "87%")
        #expect(digest.timeToMastery?.hoursText == "5.3 h")
        #expect(digest.concerns.map(\.label) == ["Developer experience", "Security"])
    }

    @Test("should decode a quiet week with no retention, mastery or coverage")
    func decodesQuietWeek() throws {
        let digest = try Fixture.decode(WeeklyDigest.self, "weekly-digest-quiet-week")

        #expect(digest.timeToMastery == nil)
        #expect(digest.retention == nil)
        #expect(digest.averageCoverage == nil)
    }

    @Test("should decode the retention report and ignore the per-topic breakdown")
    func decodesRetentionReport() throws {
        let report = try Fixture.decode(RetentionReport.self, "retention-report")

        #expect(report.overall?.count == 120)
        #expect(report.overall?.medianPercentText == "85%")
        #expect(report.timeToMasteryOverall?.medianHoursText == "5.5 h")
    }

    @Test("should decode a retention report with nothing reviewed yet")
    func decodesEmptyRetentionReport() throws {
        let report = try Fixture.decode(RetentionReport.self, "retention-report-empty")

        #expect(report.overall == nil)
        #expect(report.timeToMasteryOverall == nil)
    }

    @Test("should decode milestones, including one whose course was deleted")
    func decodesMilestones() throws {
        let milestones = try Fixture.decode([Milestone].self, "milestones")

        #expect(milestones.map(\.kindLabel) == ["Course mastered", "Area mastered"])
        #expect(milestones[0].entityLabel == "Distributed systems")
        #expect(milestones[1].entityLabel == nil)
    }

    @Test("should decode course stats with weak spots, strong points and the next step")
    func decodesCurriculumStats() throws {
        let stats = try Fixture.decode(CurriculumStats.self, "curriculum-stats")

        #expect(stats.attemptedTopicCount == 5)
        #expect(stats.weakSpots.first?.openGapLabels == ["half-open state", "timeouts"])
        #expect(stats.strongPoints.first?.maturity == 90)
        #expect(stats.recommendationsEligible)
        #expect(stats.nextStep?.kind == "different_topic")
        #expect(stats.nextStep?.level == nil)
    }
}
