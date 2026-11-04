import Foundation

public enum InboxSearch {
    public static func filter(_ items: [InboxKnowledgeBit], query: String?) -> [InboxKnowledgeBit] {
        guard let term = RejectedSearchQuery.normalize(query) else { return items }

        return items.filter {
            $0.body.localizedCaseInsensitiveContains(term) || ($0.subjectName?.localizedCaseInsensitiveContains(term) ?? false)
        }
    }

    public static func emptyTitle(query: String?) -> String {
        guard let term = RejectedSearchQuery.normalize(query) else { return "Inbox is empty" }

        return "No Inbox cards match \"\(term)\""
    }
}
