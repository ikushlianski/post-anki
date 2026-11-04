import Testing
@testable import PostAnkiAPI

@Suite("Inbox search")
struct InboxSearchTests {
    private func bit(_ id: String, _ body: String, subject: String?) -> InboxKnowledgeBit {
        InboxKnowledgeBit(id: id, body: body, background: nil, exampleAiGeneratedAt: nil, origin: "x", subjectName: subject, cardCount: 1, inboxAt: "2026-01-01")
    }

    private var items: [InboxKnowledgeBit] {
        [bit("1", "Photosynthesis makes sugar", subject: "Biology"), bit("2", "Rust ownership rules", subject: "Programming"), bit("3", "No subject card", subject: nil)]
    }

    @Test("should match card text ignoring case")
    func body() {
        #expect(InboxSearch.filter(items, query: "OWNERSHIP").map(\.id) == ["2"])
    }

    @Test("should match the subject name")
    func subject() {
        #expect(InboxSearch.filter(items, query: "biol").map(\.id) == ["1"])
    }

    @Test("should return everything for a blank search")
    func blank() {
        #expect(InboxSearch.filter(items, query: "  ").count == 3)
        #expect(InboxSearch.filter(items, query: nil).count == 3)
    }

    @Test("should name the search when nothing matches")
    func empty() {
        #expect(InboxSearch.filter(items, query: "zzz").isEmpty)
        #expect(InboxSearch.emptyTitle(query: "zzz") == "No Inbox cards match \"zzz\"")
        #expect(InboxSearch.emptyTitle(query: nil) == "Inbox is empty")
    }
}
