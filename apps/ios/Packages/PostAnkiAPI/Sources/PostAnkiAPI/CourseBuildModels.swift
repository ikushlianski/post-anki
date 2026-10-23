import Foundation

public struct CourseBuildCourse: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let subjectId: String
    public let name: String
    public let status: String
    public let origin: String?

    public var statusLabel: String {
        switch status {
        case "draft", "curating": "Gathering sources"
        case "awaiting_source_approval": "Needs source approval"
        case "shaping_structure": "Shaping the structure"
        case "ready": "Choose topics"
        case "failed": "Failed"
        case "confirmed": "Ready"
        default: status
        }
    }
}

public struct CourseBuildSource: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: String
    public let value: String
    public let title: String?
    public let approvalStatus: String

    public var isApproved: Bool { approvalStatus == "approved" }
}

public struct CourseBuildTopic: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let included: Bool
}

public struct CourseBuildModule: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let topics: [CourseBuildTopic]
}

public struct CourseBuildDetail: Decodable, Sendable {
    public let curriculum: CourseBuildCourse
    public let sources: [CourseBuildSource]
    public let modules: [CourseBuildModule]
    public let hasStructureDraftAttempt: Bool
}

public struct CourseBuildSnapshotTopic: Decodable, Sendable, Hashable {
    public let title: String
    public let suggestedDepth: String?
}

public struct CourseBuildSnapshotModule: Decodable, Sendable, Hashable {
    public let title: String
    public let level: String?
    public let topics: [CourseBuildSnapshotTopic]
}

public struct CourseBuildSnapshot: Decodable, Sendable, Hashable {
    public let modules: [CourseBuildSnapshotModule]
}

public struct CourseBuildCandidate: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let title: String
    public let value: String
    public let approvalStatus: String
}

public struct CourseBuildTurn: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let role: String
    public let message: String
    public let structureSnapshot: CourseBuildSnapshot?
    public let status: String
    public let pendingResearchCandidates: [CourseBuildCandidate]
}

public struct CourseBuildSourceInput: Encodable, Sendable {
    public let kind: String
    public let value: String

    public init(
        kind: String,
        value: String
    ) {
        self.kind = kind
        self.value = value
    }
}

public struct CourseBuildCreateInput: Encodable, Sendable {
    public let subjectId: String
    public let name: String
    public let description: String?
    public let categoryId: String?
    public let sources: [CourseBuildSourceInput]?
    public let researchTopic: String?
    public let docUrl: String?
    public let pastedMaterial: String?

    public init(
        subjectId: String,
        name: String,
        description: String?,
        categoryId: String?,
        sources: [CourseBuildSourceInput]?,
        researchTopic: String?,
        docUrl: String?,
        pastedMaterial: String?
    ) {
        self.subjectId = subjectId
        self.name = name
        self.description = description
        self.categoryId = categoryId
        self.sources = sources
        self.researchTopic = researchTopic
        self.docUrl = docUrl
        self.pastedMaterial = pastedMaterial
    }
}

public struct CourseBuildAddSourcesInput: Encodable, Sendable {
    public let curriculumId: String
    public let sources: [CourseBuildSourceInput]
}

public struct CourseBuildApproveInput: Encodable, Sendable {
    public let override: Bool
}

public struct CourseBuildTurnInput: Encodable, Sendable {
    public let message: String
}

public struct CourseBuildResolveInput: Encodable, Sendable {
    public let approvedCandidateIds: [String]
}

public struct CourseBuildIncludeInput: Encodable, Sendable {
    public let included: Bool
}

public enum CourseBuildError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(let status, let code) = error {
            switch code {
            case "no_approved_sources": return "None of these sources can be used."
            case "shaping_structure_in_progress": return "Wait for the current step to finish."
            case "turn_limit_reached": return "This course has reached 40 rounds. Confirm the structure or start again."
            case "not_studyable": return "Include at least one topic."
            case "sources_required": return "Add at least one link."
            case "turn_in_progress": return "The assistant is still answering."
            default: break
            }

            if status == 409 { return "This course moved on to another step. Pull to refresh." }
        }

        return StudyToolsError.message(for: error, notFound: "That course is gone.")
    }
}
