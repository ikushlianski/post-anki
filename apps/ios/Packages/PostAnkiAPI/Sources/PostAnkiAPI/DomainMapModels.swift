import Foundation

public struct DomainNodeCurriculum: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
}

public struct DomainNodeItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let subjectId: String
    public let parentId: String?
    public let name: String
    public let description: String?
    public let order: Int
    public let percent: Int
    public let targetDepth: String?
    public let curricula: [DomainNodeCurriculum]
    public let children: [DomainNodeItem]
    public let supersededAt: String?
    public let supersededReason: String?

    public var isSuperseded: Bool { supersededAt != nil }

    public var outline: [DomainNodeItem]? { children.isEmpty ? nil : children }
}

public enum DomainDepth: Sendable {
    public static let all = ["awareness", "working", "deep"]

    public static func label(_ depth: String?) -> String {
        switch depth {
        case "awareness": "Awareness"
        case "working": "Working"
        case "deep": "Deep"
        default: "Not set"
        }
    }
}

public struct UpdateDomainNodeInput: Encodable, Sendable {
    public let targetDepth: String?

    enum CodingKeys: String, CodingKey { case targetDepth }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(targetDepth, forKey: .targetDepth)
    }
}

public struct MergeDomainNodesInput: Encodable, Sendable {
    public let sourceDomainNodeId: String
}

public struct MergeDomainNodesResult: Decodable, Sendable {
    public let curriculaMoved: Int
    public let childNodesMoved: Int
}

public struct CurriculumDomainMapping: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let curriculumId: String
    public let domainNodeId: String
    public let depth: String?
    public let status: String
}

public struct ResolveDomainMappingInput: Encodable, Sendable {
    public let status: String
    public let depth: String?
}

public struct CourseRefocusSuggestion: Decodable, Sendable, Hashable, Identifiable {
    public let curriculumId: String
    public let subjectId: String
    public let subjectName: String
    public let courseName: String
    public let reason: String
    public let dismissedAt: String?

    public var id: String { "\(curriculumId)|\(reason)" }

    public var reasonText: String {
        reason == "stale_top_priority"
            ? "Its area is your top priority but you haven't studied it lately"
            : "A new high-priority area isn't covered"
    }
}

public enum DomainMapError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(let status, let code) = error {
            switch (status, code) {
            case (409, _): return "Already handled."
            case (502, _): return "The AI call failed. Try again later."
            case (_, "subject_has_no_static_taxonomy"), (_, "no_domain_nodes"), (_, "not_taxonomy_backed"):
                return "This subject has no map yet."
            case (_, "different_subjects"): return "Those areas belong to different subjects."
            case (_, "cycle"): return "That merge would put an area inside itself."
            default: break
            }
        }

        return StudyToolsError.message(for: error, notFound: "That item is gone.")
    }
}
