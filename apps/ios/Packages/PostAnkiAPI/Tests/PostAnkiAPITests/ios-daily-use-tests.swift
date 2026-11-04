import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Add paste, review haptic, connection messages and learning stats")
struct IOSDailyUseTests {
    @Test("should fill an empty field with the pasted link and append to existing text")
    func paste() {
        #expect(AddKnowledgeDraft.pasting(" https://a.com/x \n", into: "") == "https://a.com/x")
        #expect(AddKnowledgeDraft.pasting("https://a.com", into: "notes") == "notes\nhttps://a.com")
        #expect(AddKnowledgeDraft.pasting("https://a.com", into: "notes\n") == "notes\nhttps://a.com")
        #expect(AddKnowledgeDraft.pasting("   ", into: "notes") == "notes")
    }

    @Test("should give a stronger haptic for Again than for other grades")
    func haptic() {
        #expect(ReviewGradeHaptic.kind(for: .again) == .strong)
        #expect(ReviewGradeHaptic.kind(for: .hard) == .light)
        #expect(ReviewGradeHaptic.kind(for: .good) == .light)
        #expect(ReviewGradeHaptic.kind(for: .easy) == .light)
    }

    @Test("should tell offline from sign-in problems and fall back otherwise")
    func connection() {
        let fallback = "Couldn't load items."

        #expect(ConnectionFailureMessage.message(for: URLError(.notConnectedToInternet), fallback: fallback) == ConnectionFailureMessage.offline)
        #expect(ConnectionFailureMessage.message(for: URLError(.dataNotAllowed), fallback: fallback) == ConnectionFailureMessage.offline)
        #expect(ConnectionFailureMessage.message(for: APIError.unauthorized, fallback: fallback) == ConnectionFailureMessage.unauthorized)
        #expect(ConnectionFailureMessage.message(for: APIError.badStatus(500, nil), fallback: fallback) == fallback)
        #expect(InboxMessages.listFailure(for: URLError(.timedOut)) == ConnectionFailureMessage.offline)
        #expect(InboxMessages.listFailure(for: APIError.badStatus(500, nil)) == "Couldn't load the Inbox.")
    }

    @Test("should build the learning stats path with timezone and days")
    func path() {
        #expect(APIClient.learningStatsPath(tz: "Europe/Warsaw", days: 30) == "/stats/learning?tz=Europe/Warsaw&days=30" || APIClient.learningStatsPath(tz: "Europe/Warsaw", days: 30) == "/stats/learning?tz=Europe%2FWarsaw&days=30")
    }

    @Test("should decode daily reviews and summarise them for VoiceOver")
    func stats() throws {
        let json = #"{"today":{"reviews":1,"newCards":0},"daily":[{"date":"2026-10-01","reviews":4,"newCards":1,"passed":3,"studyMs":10},{"date":"2026-10-02","reviews":10,"newCards":0,"passed":9,"studyMs":10}],"hourly":[],"streak":{"current":1,"longest":2},"accuracy":{"overall":null,"last7":null},"env":"x"}"#
        let stats = try JSONDecoder().decode(LearningStats.self, from: Data(json.utf8))

        #expect(stats.totalReviews == 14)
        #expect(!stats.isEmpty)
        #expect(stats.daily[0].day != nil)
        #expect(stats.accessibilitySummary == "Reviews per day, last 2 days. 14 reviews in total, 7.0 per day on average. Busiest day 2026-10-02 with 10 reviews")
    }

    @Test("should report an empty period")
    func empty() throws {
        let stats = try JSONDecoder().decode(LearningStats.self, from: Data(#"{"daily":[{"date":"2026-10-01","reviews":0,"newCards":0}]}"#.utf8))

        #expect(stats.isEmpty)
        #expect(stats.accessibilitySummary == "No reviews in the last 30 days")
    }
}
