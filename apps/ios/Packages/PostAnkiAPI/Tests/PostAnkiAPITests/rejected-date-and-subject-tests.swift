import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Rejected cards subject filter and date")
    struct RejectedSubjectAndDateTests {
        private let utc = TimeZone(identifier: "UTC")!
        private let us = Locale(identifier: "en_US")

        private func subject(_ id: String, _ name: String, parent: String? = nil) -> Subject {
            Subject(id: id, name: name, description: nil, parentId: parent)
        }

        @Test("should send subjectId alongside reason and search")
        func sendsSubject() {
            let path = APIClient.rejectedCardsPath(reason: .other, subjectId: "sub 1", query: "tcp", offset: 0, limit: 50)

            #expect(path == "/knowledge-bits/rejected?reason=other&subjectId=sub%201&q=tcp&limit=50&offset=0")
        }

        @Test("should omit subjectId when none or empty")
        func omitsSubject() {
            #expect(!APIClient.rejectedCardsPath(reason: nil, subjectId: nil, offset: 0, limit: 50).contains("subjectId"))
            #expect(!APIClient.rejectedCardsPath(reason: nil, subjectId: "", offset: 0, limit: 50).contains("subjectId"))
        }

        @Test("should say no cards in this subject when a subject filter returns nothing")
        func emptyTitle() {
            #expect(RejectedSearchQuery.emptyTitle(query: nil, reason: nil, hasSubject: true) == "No rejected cards in this subject")
            #expect(RejectedSearchQuery.emptyTitle(query: "zz", reason: nil, hasSubject: true) == "No rejected cards match \"zz\"")
        }

        @Test("should label nested subjects by path and sort them alphabetically")
        func pathLabels() {
            let options = RejectedSubjectOptions.options(from: [
                subject("b", "Bio"),
                subject("t", "TCP", parent: "n"),
                subject("n", "Net"),
            ])

            #expect(options.map(\.label) == ["Bio", "Net", "Net › TCP"])
            #expect(options.map(\.id) == ["b", "n", "t"])
        }

        @Test("should not loop forever on a subject cycle")
        func cycle() {
            let options = RejectedSubjectOptions.options(from: [subject("a", "A", parent: "b"), subject("b", "B", parent: "a")])

            #expect(options.count == 2)
        }

        @Test("should show the rejection day as an abbreviated date")
        func formatsDay() {
            #expect(RejectedDateLabel.day("2027-01-05T10:30:00.000Z", locale: us, timeZone: utc) == "Jan 5, 2027")
            #expect(RejectedDateLabel.day("2027-01-05T10:30:00Z", locale: us, timeZone: utc) == "Jan 5, 2027")
        }

        @Test("should use the reader's time zone for the day")
        func zone() {
            let tokyo = TimeZone(identifier: "Asia/Tokyo")!

            #expect(RejectedDateLabel.day("2027-01-05T20:00:00Z", locale: us, timeZone: tokyo) == "Jan 6, 2027")
        }

        @Test("should show nothing for an unreadable date")
        func invalid() {
            #expect(RejectedDateLabel.day("not a date") == nil)
        }
    }
}
