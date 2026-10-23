import Foundation

public struct GapMastery: Decodable, Sendable, Hashable {
    public let status: String
}

public struct Gap: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let topicId: String
    public let label: String
    public let origin: String
    public var state: String
    public var wanted: Bool
    public let concern: String?
    public let mastery: GapMastery?
    public var triageState: String
    public let deferredUntil: String?
    public let dismissedAt: String?

    public var statusText: String {
        (mastery?.status ?? state).capitalized
    }
}

public struct DeclareGapInput: Encodable, Sendable {
    public let topicId: String
    public let label: String
    public var wanted = true
    public var concern: String?

    public init(
        topicId: String,
        label: String,
        wanted: Bool = true,
        concern: String? = nil
    ) {
        self.topicId = topicId
        self.label = label
        self.wanted = wanted
        self.concern = concern
    }
}

public struct CurateGapInput: Encodable, Sendable {
    public var state: String?
    public var wanted: Bool?

    public init(
        state: String? = nil,
        wanted: Bool? = nil
    ) {
        self.state = state
        self.wanted = wanted
    }
}

public struct TriageGapInput: Encodable, Sendable {
    public let action: String
}

public struct TriageGapResult: Decodable, Sendable {
    public let gap: Gap
    public let changed: Bool
}

public struct GapResurfaceItem: Decodable, Sendable, Hashable, Identifiable {
    public let gap: Gap

    public var id: String { gap.id }
}

public struct GapsDueForResurface: Decodable, Sendable {
    public let userDeferredDue: [GapResurfaceItem]
    public let dismissedCheckinDue: [GapResurfaceItem]
}

public enum GapConcern: Sendable {
    public static let all = [
        "security", "performance", "observability", "cost", "reliability", "developer_experience"
    ]

    public static func label(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

public enum GapError: Sendable {
    public static func message(for error: Error) -> String {
        StudyToolsError.message(for: error, notFound: "This gap was removed.")
    }
}
