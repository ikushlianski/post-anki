import Foundation

public struct SubjectManageSubject: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let kind: String
    public let parentId: String?
    public let sortOrder: Int?
}

public struct SubjectManageCourse: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let subjectId: String
    public let name: String
    public let status: String
    public let categoryId: String?
}

public struct SubjectManageCreateInput: Encodable, Sendable {
    public let name: String
    public let parentId: String?
}

public struct SubjectManageRenameInput: Encodable, Sendable {
    public let name: String
}

public struct SubjectManageOrderInput: Encodable, Sendable {
    public let parentId: String?
    public let orderedIds: [String]

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(parentId, forKey: .parentId)
        try container.encode(orderedIds, forKey: .orderedIds)
    }

    private enum CodingKeys: String, CodingKey {
        case parentId, orderedIds
    }
}

public struct SubjectManageMergeInput: Encodable, Sendable {
    public let sourceSubjectId: String
}

public struct SubjectManageMergeResult: Decodable, Sendable {
    public let curriculaMoved: Int
}

public struct SubjectCategory: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let subjectId: String
    public let parentId: String?
    public let name: String
}

public struct SubjectCategoryCreateInput: Encodable, Sendable {
    public let name: String
    public let parentId: String?
}

public struct SubjectCategoryMoveInput: Encodable, Sendable {
    public let parentId: String?

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(parentId, forKey: .parentId)
    }

    private enum CodingKeys: String, CodingKey {
        case parentId
    }
}

public struct SubjectCategoryRenameInput: Encodable, Sendable {
    public let name: String
}

public struct SubjectCategoryCourseMoveInput: Encodable, Sendable {
    public let targetSubjectId: String
    public let categoryId: String?

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(targetSubjectId, forKey: .targetSubjectId)
        try container.encode(categoryId, forKey: .categoryId)
    }

    private enum CodingKeys: String, CodingKey {
        case targetSubjectId, categoryId
    }
}

public enum SubjectManageError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(400, let code) = error {
            switch code {
            case "kind_mismatch": return "These subjects are different kinds and can't be merged."
            case "self_merge": return "A subject can't be merged into itself."
            case "invalid_id_set": return "The list changed. Try again."
            case "would_create_cycle": return "A category can't go inside itself."
            case "invalid_parent": return "A subject can't go inside itself."
            default: break
            }
        }

        return StudyToolsError.message(for: error, notFound: "That item is gone. Refresh and try again.")
    }
}
