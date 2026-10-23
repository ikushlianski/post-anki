import Foundation

public struct DomainPrioritySuggestion: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let domainNodeId: String
    public let currentTargetDepth: String?
    public let suggestedTargetDepth: String
    public let reason: String
    public let status: String
}

public struct DomainPriorityReviewStatus: Decodable, Sendable {
    public let lastReviewedAt: String?
    public let due: Bool
}

public struct DomainTopicSuggestion: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let proposedNodeName: String
    public let reason: String
    public let status: String
}

public struct DomainSupersessionSuggestion: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let domainNodeId: String
    public let reason: String
    public let status: String
}

public struct DocScanSuggestions: Decodable, Sendable {
    public let newTopics: [DomainTopicSuggestion]
    public let supersessions: [DomainSupersessionSuggestion]
}

public struct DomainRecommendation: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let domainNodeId: String
    public let axis: String
    public let reason: String
    public let status: String
    public let createdCurriculumId: String?

    public var axisLabel: String { axis == "deepen" ? "Go deeper" : "Branch out" }
}

public struct ResolveSuggestionInput: Encodable, Sendable {
    public let status: String

    public init(accepted: Bool) {
        status = accepted ? "accepted" : "rejected"
    }
}
