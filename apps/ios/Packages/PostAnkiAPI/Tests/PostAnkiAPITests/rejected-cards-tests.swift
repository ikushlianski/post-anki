import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Rejected cards contract")
    struct RejectedCardsTests {
        @Test("should list rejected cards with their reason and tell whether more pages exist")
        func decodesPage() async throws {
            let json = #"{"items":[{"knowledgeBitId":"kb1","body":"Q?","reasonCode":"wrong_language","decidedAt":"2026-10-28T10:00:00.000Z"},{"knowledgeBitId":"kb2","body":"R?","reasonCode":"unspecified","decidedAt":"2026-10-27T10:00:00.000Z"}],"hasMore":true}"#
            RecordingStub.install(body: Data(json.utf8))

            let page = try await APIClient.rejectedCards()
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/knowledge-bits/rejected")
            #expect(page.hasMore)
            #expect(page.items.map(\.id) == ["kb1", "kb2"])
            #expect(page.items[0].reasonLabel == "Wrong language")
            #expect(page.items[1].reasonLabel == "No reason given")
        }

        @Test("should show the source note title and link it only when the address is http or https")
        func decodesSource() async throws {
            let json = #"{"items":[{"knowledgeBitId":"a","body":"Q","reasonCode":"other","decidedAt":"d","sourceTitle":"My note","sourceUrl":"https://example.com/x"},{"knowledgeBitId":"b","body":"Q","reasonCode":"other","decidedAt":"d","sourceTitle":"Evil","sourceUrl":"javascript:alert(1)"},{"knowledgeBitId":"c","body":"Q","reasonCode":"other","decidedAt":"d","sourceTitle":null,"sourceUrl":null},{"knowledgeBitId":"d","body":"Q","reasonCode":"other","decidedAt":"d"},{"knowledgeBitId":"e","body":"Q","reasonCode":"other","decidedAt":"d","sourceTitle":"Local","sourceUrl":"file:///etc/passwd"}],"hasMore":false}"#
            RecordingStub.install(body: Data(json.utf8))

            let items = try await APIClient.rejectedCards().items

            #expect(items[0].sourceTitleText == "My note")
            #expect(items[0].sourceLink?.absoluteString == "https://example.com/x")
            #expect(items[1].sourceTitleText == "Evil")
            #expect(items[1].sourceLink == nil)
            #expect(items[2].sourceTitleText == nil)
            #expect(items[2].sourceLink == nil)
            #expect(items[3].sourceTitleText == nil)
            #expect(items[4].sourceLink == nil)
        }

        @Test("should send the chosen reason and the page offset when filtering")
        func buildsFilterQuery() async throws {
            RecordingStub.install(body: Data(#"{"items":[],"hasMore":false}"#.utf8))

            _ = try await APIClient.rejectedCards(reason: .duplicateOrOverlap, offset: 50)
            let request = try #require(RecordingStub.last)

            #expect(request.path == "/knowledge-bits/rejected")
            #expect(
                APIClient.rejectedCardsPath(reason: .duplicateOrOverlap, offset: 50, limit: 50)
                    == "/knowledge-bits/rejected?reason=duplicate_or_overlap&limit=50&offset=50"
            )
        }

        @Test("should omit the reason when showing all reasons")
        func omitsReasonForAll() {
            #expect(APIClient.rejectedCardsPath(reason: nil, offset: 0, limit: 50) == "/knowledge-bits/rejected?limit=50&offset=0")
        }

        @Test("should offer a chip for every reason code the server accepts")
        func coversServerCodes() {
            #expect(RejectedCardReason.allCases.count == 12)
            #expect(RejectedCardReason.label(forCode: "something_new") == "Other reason")
        }

        @Test("should read per-reason counts when the server sends them")
        func decodesCounts() async throws {
            let json = #"{"items":[],"hasMore":false,"reasonCounts":{"wrong_language":3,"unspecified":2}}"#
            RecordingStub.install(body: Data(json.utf8))

            let page = try await APIClient.rejectedCards()
            let counts = RejectedReasonCounts(page.reasonCounts)

            #expect(page.reasonCounts == ["wrong_language": 3, "unspecified": 2])
            #expect(RejectedReasonCounts.allTitle(counts) == "All reasons (5)")
            #expect(RejectedReasonCounts.chipTitle(.wrongLanguage, counts: counts) == "Wrong language (3)")
            #expect(RejectedReasonCounts.chipTitle(.badFormat, counts: counts) == "Bad format (broken blank, yes/no) (0)")
        }

        @Test("should still decode older responses and hide counts when the field is absent")
        func decodesWithoutCounts() async throws {
            RecordingStub.install(body: Data(#"{"items":[],"hasMore":false}"#.utf8))

            let page = try await APIClient.rejectedCards()
            let counts = RejectedReasonCounts(page.reasonCounts)

            #expect(page.reasonCounts == nil)
            #expect(counts == nil)
            #expect(RejectedReasonCounts.allTitle(counts) == "All reasons")
            #expect(RejectedReasonCounts.chipTitle(.wrongLanguage, counts: counts) == "Wrong language")
        }

        @Test("should post to the restore path of the rejected card")
        func postsRestore() async throws {
            RecordingStub.install(body: Data(#"{"ok":true}"#.utf8))

            try await APIClient.restoreRejectedCard(id: "kb/1")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "POST")
            #expect(request.path == "/knowledge-bits/kb%2F1/restore-rejected")
        }

        @Test("should drop the row when the card is missing and refresh when it is no longer rejected")
        func mapsRestoreStatuses() {
            #expect(RejectedCardRestoreOutcome.outcome(for: APIError.badStatus(404, "not_found")) == .alreadyGone)
            #expect(RejectedCardRestoreOutcome.outcome(for: APIError.badStatus(409, "not_rejected")) == .notRejected)
        }

        @Test("should keep the row when restoring fails for any other reason")
        func keepsRowOnOtherFailures() {
            for error in [APIError.badStatus(500, nil) as Error, APIError.unauthorized, URLError(.notConnectedToInternet)] {
                #expect(RejectedCardRestoreOutcome.outcome(for: error) == .failed)
            }
        }
    }
}
