import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Weekly digest contract")
    struct WeeklyDigestTests {
        @Test("should read this week and last week counts and the Chat backlog from the digest endpoint")
        func readsDigest() async throws {
            let json = #"{"current":{"accepted":5,"rejected":2,"reviewed":30},"previous":{"accepted":3,"rejected":2,"reviewed":40},"chatBacklog":4,"windowStart":"a","windowEnd":"b"}"#
            RecordingStub.install(body: Data(json.utf8))

            let digest = try await APIClient.weeklyDigestSummary()
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/analytics/weekly-digest")
            #expect(digest.current.accepted == 5)
            #expect(digest.previous.reviewed == 40)
            #expect(digest.chatBacklog == 4)
        }

        @Test("should still show the card with zeros when the server omits or garbles fields")
        func decodesTolerantly() throws {
            let json = #"{"current":{"accepted":"x","reviewed":7},"chatBacklog":null}"#
            let digest = try JSONDecoder().decode(WeeklyDigestSummary.self, from: Data(json.utf8))

            #expect(digest.current.accepted == 0)
            #expect(digest.current.reviewed == 7)
            #expect(digest.previous == WeeklyDigestCounts())
            #expect(digest.chatBacklog == 0)
        }

        @Test("should show the Chat activity line only when there were Chat turns this week")
        func showsChatLineOnlyWithTurns() throws {
            let busy = #"{"chatBacklog":1,"chatCards":3,"chatTurns":12}"#
            let single = #"{"chatBacklog":1,"chatCards":1,"chatTurns":1}"#
            let quiet = #"{"chatBacklog":1,"chatCards":2,"chatTurns":0}"#
            let old = #"{"chatBacklog":1}"#
            let decode = { (json: String) in try JSONDecoder().decode(WeeklyDigestSummary.self, from: Data(json.utf8)) }

            #expect(try decode(busy).chatActivityLine == "Chat: 3 cards, 12 turns this week")
            #expect(try decode(single).chatActivityLine == "Chat: 1 card, 1 turn this week")
            #expect(try decode(quiet).chatActivityLine == nil)
            #expect(try decode(old).chatActivityLine == nil)
            #expect(try decode(old).chatTurns == nil)
        }

        @Test("should read each top reject reason with its signed change and hide it when 0 or absent")
        func readsRejectReasonDeltas() throws {
            let json = #"{"chatBacklog":1,"topRejectReasons":[{"reason":"wrong_language","count":5,"delta":3},{"reason":"bad_format","count":2,"delta":-2},{"reason":"other","count":1,"delta":0},{"reason":"unspecified","count":1},{"bad":true}]}"#
            let digest = try JSONDecoder().decode(WeeklyDigestSummary.self, from: Data(json.utf8))
            let reasons = digest.topRejectReasons

            #expect(reasons.count == 4)
            #expect(reasons[0].label == "Wrong language")
            #expect(reasons[0].deltaText == "+3")
            #expect(reasons[1].deltaText == "-2")
            #expect(reasons[2].deltaText == nil)
            #expect(reasons[3].deltaText == nil)
            #expect(try JSONDecoder().decode(WeeklyDigestSummary.self, from: Data(#"{"chatBacklog":1}"#.utf8)).topRejectReasons.isEmpty)
        }

        @Test("should word the change against last week in text for up, down and same")
        func wordsDeltas() {
            #expect(WeeklyDigestDelta.text(current: 5, previous: 3) == "Up 2 from last week")
            #expect(WeeklyDigestDelta.text(current: 1, previous: 4) == "Down 3 from last week")
            #expect(WeeklyDigestDelta.text(current: 2, previous: 2) == "Same as last week")
        }

        @Test("should hide the last-week comparison when last week had nothing to compare to")
        func hidesComparisonWhenLastWeekWasZero() {
            #expect(WeeklyDigestDelta.line(current: 15, previous: 0) == nil)
            #expect(WeeklyDigestDelta.line(current: 0, previous: 0) == nil)
            #expect(WeeklyDigestDelta.line(current: 5, previous: 3) == "Up 2 from last week")
            #expect(WeeklyDigestDelta.line(current: 0, previous: 2) == "Down 2 from last week")
        }

        @Test("should map server and network failures so the card can hide quietly")
        func mapsFailures() async {
            RecordingStub.install(status: 401)

            await #expect(throws: WeeklyDigestFailure.unauthorized) { try await APIClient.weeklyDigestSummary() }

            RecordingStub.install(status: 500)

            await #expect(throws: WeeklyDigestFailure.other) { try await APIClient.weeklyDigestSummary() }
            #expect(WeeklyDigestFailure.failure(for: URLError(.notConnectedToInternet)) == .offline)
        }
    }
}
