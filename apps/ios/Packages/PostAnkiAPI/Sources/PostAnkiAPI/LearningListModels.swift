import Foundation

public struct LearningListRecommendation: Decodable, Sendable, Hashable {
    public let destination: String
    public let reasons: [String]
    public let areaName: String?
    public let partCount: Int?
    public let existingCurriculumMatch: LearningListCurriculumMatch?
}

public struct LearningListCurriculumMatch: Decodable, Sendable, Hashable {
    public let curriculumId: String
    public let title: String
}

public struct LearningListItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let url: String?
    public let rawText: String?
    public let title: String?
    public let kind: String
    public let recommendation: LearningListRecommendation?
    public let status: String
    public let curriculumId: String?
    public let createdAt: String

    public var isAwaitingDecision: Bool {
        guard status == "classified", let destination = recommendation?.destination else { return false }

        return ["mini_course", "extend_curriculum", "fold_in"].contains(destination)
    }

    public var displayTitle: String {
        if let title, !title.isEmpty { return title }

        if let url, let host = URL(string: url)?.host { return host }

        if let rawText, !rawText.isEmpty { return rawText }

        return url ?? "Untitled"
    }

    public var statusCaption: String {
        switch status {
        case "captured": "Saved"
        case "classifying": "Sorting"
        case "classified": isAwaitingDecision ? "Needs your decision" : "Sorted"
        case "folded_in": "Added to an area"
        case "parked": "Parked"
        case "course_created": "Course made"
        case "declined": "Declined"
        case "unreachable": "Couldn't read"
        default: status
        }
    }
}

public struct LearningListDecisionResult: Decodable, Sendable {
    public let item: LearningListItem
    public let curriculumId: String?
}

public struct CaptureLearningItemInput: Encodable, Sendable {
    public let url: String
    public let kind: String
    public let pastedDescription: String?
    public let subjectId: String
}

public struct LearningListDecisionInput: Encodable, Sendable {
    public let decision: String
}

public struct LearningListDestinationInput: Encodable, Sendable {
    public let destination: String
}

public struct LearningListClassificationInput: Encodable, Sendable {
    public let subjectId: String
}

public enum LearningListError: Sendable {
    public static func message(for error: Error) -> String {
        if case APIError.badStatus(_, let code) = error {
            switch code {
            case "video_requires_description": return "Add a short description for videos."
            case "source_blocked": return "That site blocks reading."
            case "source_unreachable": return "Couldn't reach that link."
            case "source_empty": return "That page had nothing to read."
            case "classification_failed": return "Saved, but couldn't sort it yet."
            case "not_awaiting_decision", "not_parked", "not_capturable": return "This item changed. Refreshed."
            case "extend_target_missing", "extend_target_busy": return "That course can't be extended right now."
            default: break
            }
        }

        return StudyToolsError.message(for: error, notFound: "That item is gone.")
    }

    public static func isStale(_ error: Error) -> Bool {
        if case APIError.badStatus(409, _) = error { return true }

        return false
    }
}
