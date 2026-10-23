import Foundation

public struct LearningPathTarget: Decodable, Sendable, Hashable {
    public let domainNodeId: String
    public let name: String
}

public struct RoleTemplate: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let targetRoleLabel: String
    public let targets: [LearningPathTarget]
}

public struct LearningPath: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let targetRoleLabel: String
    public let status: String
    public let createdAt: String
}

public struct LearningPathStep: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let domainNodeId: String
    public let order: Int
}

public struct LearningPathStepProgress: Decodable, Sendable, Hashable {
    public let topicsIncluded: Int
    public let topicsMastered: Int
    public let percent: Int
}

public struct LearningPathStepStatus: Decodable, Sendable, Hashable {
    public let domainNodeId: String
    public let progress: LearningPathStepProgress
    public let status: String
}

public struct LearningPathProgress: Decodable, Sendable, Hashable {
    public let overallStatus: String
    public let steps: [LearningPathStepStatus]
}

public struct LearningPathDetail: Decodable, Sendable {
    public let path: LearningPath
    public let steps: [LearningPathStep]
    public let progress: LearningPathProgress
    public let nextStepDomainNodeId: String?
}

public struct StartLearningPathInput: Encodable, Sendable {
    public let roleTemplateId: String
}

public struct AbandonLearningPathInput: Encodable, Sendable {
    public let status: String
}

public struct StartLearningPathResult: Decodable, Sendable {
    public let path: LearningPath
}

public enum LearningPathError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(_, "unresolved_target") = error {
            return "This template doesn't match your areas yet."
        }

        return StudyToolsError.message(for: error, notFound: "That path is gone.")
    }

    public static func statusLabel(_ status: String) -> String {
        switch status {
        case "active": "Active"
        case "completed": "Completed"
        case "abandoned": "Abandoned"
        case "draft": "Draft"
        case "done": "Done"
        case "in_progress": "In progress"
        case "not_started": "Not started"
        default: status.capitalized
        }
    }
}
