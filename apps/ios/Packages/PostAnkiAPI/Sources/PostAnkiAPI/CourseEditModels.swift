import Foundation

public struct CourseEditTitleInput: Encodable, Sendable {
    public let title: String
}

public struct CourseEditOrderInput: Encodable, Sendable {
    public let orderedIds: [String]
}

public struct CourseEditCommentInput: Encodable, Sendable {
    public let comment: String
}

public enum CourseEditError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(400, "invalid_id_set") = error {
            return "The list changed. Try again."
        }

        return StudyToolsError.message(for: error, notFound: "That item is gone. Pull to refresh.")
    }
}
