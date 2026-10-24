import Foundation

public enum KnowledgeSourceRefusal: String, Sendable, Hashable, CaseIterable {
    case fetchFailed = "fetch_failed"
    case emptyContent = "empty_content"
    case subjectNotFound = "subject_not_found"
    case subjectHasChildren = "subject_has_children"
    case alreadyAdded = "already_added"
    case textTooLong = "text_too_long"

    public var message: String {
        switch self {
        case .fetchFailed: return "That page could not be opened."
        case .emptyContent: return "That page has no readable text."
        case .subjectNotFound: return "The chosen subject no longer exists. Pick another subject."
        case .subjectHasChildren: return "This subject has sub-subjects. Choose one of them."
        case .alreadyAdded: return "This was already added."
        case .textTooLong: return "This text is longer than 50,000 characters. Split it into smaller blocks."
        }
    }

    public var canForce: Bool { self == .alreadyAdded }

    public static func from(_ error: Error) -> KnowledgeSourceRefusal? {
        guard case APIError.badStatus(_, let code?) = error else { return nil }

        return KnowledgeSourceRefusal(rawValue: code)
    }
}
