import Foundation

public struct Tag: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
}

public struct TagMastery: Decodable, Sendable, Hashable, Identifiable {
    public let tagId: String
    public let name: String
    public let status: String

    public var id: String { tagId }

    public var statusLabel: String {
        switch status {
        case "practicing": "Practicing"
        case "struggling": "Struggling"
        case "mastered": "Mastered"
        default: "New"
        }
    }
}

public struct TagNode: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: String
    public let title: String
    public let curriculumId: String?
    public let curriculumName: String?
}

public struct TagNodes: Decodable, Sendable {
    public let nodes: [TagNode]
    public let capped: Bool
}

public struct CreateTagInput: Encodable, Sendable {
    public let name: String
}

public struct AssignTagInput: Encodable, Sendable {
    public let nodeType: String
    public let nodeId: String
}

public struct TagAssignment: Decodable, Sendable {
    public let id: String
}

public struct MergeTagInput: Encodable, Sendable {
    public let sourceTagId: String
}

public struct MergeTagResult: Decodable, Sendable {
    public let assignmentsMoved: Int
    public let assignmentsDeduped: Int
}

public enum TagError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(400, "self_merge") = error {
            return "A tag can't be merged into itself."
        }

        return StudyToolsError.message(for: error, notFound: "That tag is gone.")
    }

    public static func isMissing(_ error: Error) -> Bool {
        if case APIError.badStatus(404, _) = error { return true }

        return false
    }
}
