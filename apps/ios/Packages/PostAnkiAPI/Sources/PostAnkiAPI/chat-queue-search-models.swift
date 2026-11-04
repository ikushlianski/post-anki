import Foundation

public enum ChatQueueSearchLimits {
    public static let minChars = 2
    public static let maxChars = 100
    public static let limit = 20
}

public struct ChatQueueSearchHit: Decodable, Sendable, Identifiable, Hashable {
    public let cardId: String
    public let seq: Int
    public let role: String
    public let snippet: String

    public var id: String { "\(cardId)-\(seq)" }
    public var roleLabel: String { role == "user" ? "You" : "Tutor" }

    public init(cardId: String, seq: Int, role: String, snippet: String) {
        self.cardId = cardId
        self.seq = seq
        self.role = role
        self.snippet = snippet
    }
}

public struct ChatQueueSearchResponse: Decodable, Sendable, Equatable {
    public let results: [ChatQueueSearchHit]
    public let hasMore: Bool?

    public var isCut: Bool { hasMore == true }

    public static let cutNotice = "Showing the first \(ChatQueueSearchLimits.limit), refine your search"

    public init(results: [ChatQueueSearchHit], hasMore: Bool? = nil) {
        self.results = results
        self.hasMore = hasMore
    }
}
