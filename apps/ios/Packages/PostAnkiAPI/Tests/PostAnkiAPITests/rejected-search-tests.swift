import Foundation
import Testing
@testable import PostAnkiAPI

extension NetworkContracts {
    @Suite("Rejected cards search")
    struct RejectedSearchTests {
        @Test("should send the trimmed search term as q alongside the reason")
        func buildsPath() {
            #expect(APIClient.rejectedCardsPath(reason: .other, query: "  a b ", offset: 0, limit: 50) == "/knowledge-bits/rejected?reason=other&q=a%20b&limit=50&offset=0")
        }

        @Test("should omit q for blank input and cap long terms")
        func omitsBlank() {
            #expect(!APIClient.rejectedCardsPath(reason: nil, query: "   ", offset: 0, limit: 50).contains("q="))
            #expect(RejectedSearchQuery.normalize(String(repeating: "x", count: 250))?.count == 200)
        }

        @Test("should say no cards match the search when a search returns nothing")
        func emptyTitles() {
            #expect(RejectedSearchQuery.emptyTitle(query: "zz", reason: nil) == "No rejected cards match \"zz\"")
            #expect(RejectedSearchQuery.emptyTitle(query: " ", reason: nil) == "No rejected cards yet")
            #expect(RejectedSearchQuery.emptyTitle(query: nil, reason: .other) == "No rejected cards with this reason")
        }
    }
}

@MainActor
@Suite("Rejected search debounce")
struct RejectedSearchDebouncerTests {
    @Test("should only search once for rapid typing and use the last text")
    func coalesces() async {
        var committed: [String?] = []
        let debouncer = RejectedSearchDebouncer(sleep: { try await Task.sleep(for: .milliseconds(80)) }, commit: { committed.append($0) })

        debouncer.input("a")
        debouncer.input("ab")
        try? await Task.sleep(for: .milliseconds(300))

        #expect(committed == ["ab"])
    }

    @Test("should not search again when the text normalizes to the current search")
    func skipsUnchanged() async {
        var committed: [String?] = []
        let debouncer = RejectedSearchDebouncer(sleep: {}, commit: { committed.append($0) })

        debouncer.input("abc")
        try? await Task.sleep(for: .milliseconds(50))
        debouncer.input(" abc ")
        try? await Task.sleep(for: .milliseconds(50))

        #expect(committed == ["abc"])
    }

    @Test("should clear the search when the box is emptied")
    func clears() async {
        var committed: [String?] = []
        let debouncer = RejectedSearchDebouncer(sleep: {}, commit: { committed.append($0) })

        debouncer.input("abc")
        try? await Task.sleep(for: .milliseconds(50))
        debouncer.input("")
        try? await Task.sleep(for: .milliseconds(50))

        #expect(committed == ["abc", nil])
    }
}
