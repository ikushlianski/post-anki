import Foundation

public enum ChatQueueProposalKind: String, Decodable, Sendable, Hashable {
    case create
    case update

    public var label: String { self == .update ? "Update to this card" : "New card" }
}

public enum ChatQueueProposalStatus: String, Decodable, Sendable, Hashable {
    case pending
    case accepted
    case rejected
}

public struct ChatQueueProposal: Decodable, Sendable, Hashable, Identifiable {
    public let index: Int
    public let kind: ChatQueueProposalKind
    public let front: String
    public let back: String
    public let example: String?
    public let reason: String?
    public var status: ChatQueueProposalStatus
    public var savedCardId: String?

    public var id: Int { index }

    public init(
        index: Int,
        kind: ChatQueueProposalKind,
        front: String,
        back: String,
        example: String? = nil,
        reason: String? = nil,
        status: ChatQueueProposalStatus = .pending,
        savedCardId: String? = nil
    ) {
        self.index = index
        self.kind = kind
        self.front = front
        self.back = back
        self.example = example
        self.reason = reason
        self.status = status
        self.savedCardId = savedCardId
    }
}

public enum ChatQueueProposalDecision: Sendable, Hashable {
    case accept
    case reject

    public init(swipe: PendingReviewDecision) {
        self = swipe == .approve ? .accept : .reject
    }

    var pathComponent: String { self == .accept ? "accept" : "reject" }
}

public struct ChatQueueProposalDecisionResult: Decodable, Sendable, Hashable {
    public let status: ChatQueueProposalStatus
    public let savedCardId: String?

    public init(status: ChatQueueProposalStatus, savedCardId: String? = nil) {
        self.status = status
        self.savedCardId = savedCardId
    }
}

struct ChatQueueProposalRewordResult: Decodable, Sendable {
    let proposal: ChatQueueProposal
}

enum ChatQueueProposalDecoding {
    static func lossyList<Key: CodingKey>(from container: KeyedDecodingContainer<Key>, key: Key) -> [ChatQueueProposal] {
        guard var list = try? container.nestedUnkeyedContainer(forKey: key) else { return [] }

        var proposals: [ChatQueueProposal] = []

        while !list.isAtEnd {
            if let proposal = try? list.decode(ChatQueueProposal.self) {
                proposals.append(proposal)
            } else {
                _ = try? list.decode(DiscardedValue.self)
            }
        }

        return proposals
    }

    private struct DiscardedValue: Decodable {}
}
