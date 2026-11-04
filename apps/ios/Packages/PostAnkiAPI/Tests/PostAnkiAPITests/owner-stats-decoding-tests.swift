import Foundation
import Testing
@testable import PostAnkiAPI

@Suite struct OwnerStatsDecodingTests {
    @Test func learningSkipsBadRowsAndKeepsNullAccuracy() throws {
        let stats = try Fixture.decode(OwnerLearningStats.self, "owner-stats-learning")

        #expect(stats.env == "development")
        #expect(stats.daily.map(\.date) == ["2026-10-30", "2026-10-31", "2026-11-01"])
        #expect(stats.daily[0].accuracy == 0.8)
        #expect(stats.daily[1].accuracy == nil)
        #expect(stats.currentStreak == 5)
        #expect(stats.longestStreak == 11)
        #expect(stats.accuracyOverall == 0.82)
        #expect(stats.accuracyLast7 == nil)
        #expect(stats.todayReviews == 12)
    }

    @Test func spendKeepsRowsWithBadAmountsAndReportsUnpriced() throws {
        let spend = try Fixture.decode(OwnerAiSpend.self, "owner-stats-ai-spend")

        #expect(spend.days.count == 2)
        #expect(spend.days[1].cardsUsd == 0)
        #expect(abs(spend.totalUsd - 0.78) < 0.0001)
        #expect(spend.unpricedCalls == 4)
        #expect(spend.unpricedTokens == 1200)
    }

    @Test func emptyObjectsStillDecode() throws {
        let learning = try JSONDecoder().decode(OwnerLearningStats.self, from: Data("{}".utf8))
        let spend = try JSONDecoder().decode(OwnerAiSpend.self, from: Data("{}".utf8))

        #expect(learning.daily.isEmpty)
        #expect(spend.days.isEmpty)
    }

    @Test func triageByModelAndSubjectTypeDecodeLeniently() throws {
        let spend = try JSONDecoder().decode(OwnerAiSpend.self, from: Data(#"{"triageByModel":[{"modelId":"m1","kept":3,"rejected":1},{"bad":true}]}"#.utf8))
        let stats = try JSONDecoder().decode(RejectReasonsStatistics.self, from: Data(#"{"total":2,"reasons":[],"bySubjectType":[{"subjectType":"language","total":2,"reasons":[{"reasonCode":"front_unclear_target_phrase","count":2,"share":1}]}]}"#.utf8))
        let old = try JSONDecoder().decode(RejectReasonsStatistics.self, from: Data(#"{"total":0,"reasons":[]}"#.utf8))

        #expect(spend.triageByModel.map(\.modelId) == ["m1"])
        #expect(spend.triageByModel[0].kept == 3)
        #expect(stats.bySubjectType[0].reasons[0].label == "Front doesn't make clear which phrase the answer should be")
        #expect(old.bySubjectType.isEmpty)
        #expect(try JSONDecoder().decode(OwnerAiSpend.self, from: Data("{}".utf8)).triageByModel.isEmpty)
    }

    @Test func pathCarriesTimeZoneAndDays() {
        #expect(APIClient.ownerStatsPath("ai-spend", tz: "Europe/Warsaw", days: 90).hasPrefix("/stats/ai-spend?"))
        #expect(APIClient.ownerStatsPath("learning", tz: "UTC", days: 7).contains("days=7"))
    }
}
