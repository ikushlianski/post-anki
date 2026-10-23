import Testing
@testable import PostAnkiMac

@MainActor
struct MacKnowledgeInboxRoutingTests {
    @Test func shouldNameTheKnowledgeItemInboxSidebarEntryKnowledgeInbox() {
        let titles = MacFeatureRegistry.features.map(\.title)

        #expect(MacFeatureRegistry.feature(id: "inbox").title == "Knowledge Inbox")
        #expect(!titles.contains("Inbox"))
        #expect(MacFeatureRegistry.feature(id: "content-inbox").title == "Content inbox")
    }

    @Test func shouldShowThePendingCountBadgeOnKnowledgeInboxAndNotOnReview() {
        #expect(MacFeatureRegistry.feature(id: "inbox").badge != nil)
        #expect(MacFeatureRegistry.feature(id: "review").badge == nil)
    }

    @Test func shouldOpenKnowledgeInboxOnPendingItemsFirst() {
        #expect(KnowledgeInboxMode.defaultMode == .pending)
        #expect(KnowledgeInboxMode.allCases.map(\.rawValue) == ["Pending items", "Placement suggestions"])
    }
}
