import Foundation

public enum StudyPlanRefusal: String, Sendable, Hashable, CaseIterable {
    case examDateRequired = "exam_date_required"
    case examDateInPast = "exam_date_in_past"
    case examDateTooFar = "exam_date_too_far"
    case examDateRequiresExamIntent = "exam_date_requires_exam_intent"
    case invalidInput = "invalid_input"
    case subjectNotFound = "subject_not_found"

    public var message: String {
        switch self {
        case .examDateRequired: return "Pick the exam date to study for an exam."
        case .examDateInPast: return "The exam date has to be today or later."
        case .examDateTooFar: return "The exam date can be at most two years ahead."
        case .examDateRequiresExamIntent: return "An exam date only works when studying for an Exam."
        case .invalidInput: return "Those values can't be used. Check them and try again."
        case .subjectNotFound: return "This subject no longer exists."
        }
    }

    public static func from(_ error: Error) -> StudyPlanRefusal? {
        guard case APIError.badStatus(_, let code?) = error else { return nil }

        return StudyPlanRefusal(rawValue: code)
    }
}

public enum StudyPlanMessage {
    public static func load(_ error: Error) -> String? {
        if let refusal = StudyPlanRefusal.from(error) { return refusal.message }

        guard let kind = ProgressLoadError.from(error) else { return nil }

        switch kind {
        case .offline: return "Couldn't connect to the server. Try again in a moment."
        case .unauthorized: return "Add your access token in Settings."
        case .notFound: return StudyPlanRefusal.subjectNotFound.message
        case .other: return "Couldn't load the study plan."
        }
    }

    public static func save(_ error: Error) -> String? {
        if let refusal = StudyPlanRefusal.from(error) { return refusal.message }

        guard let kind = ProgressLoadError.from(error) else { return nil }

        switch kind {
        case .offline: return "Couldn't save. You need a connection to change the study plan."
        case .unauthorized: return "Add your access token in Settings."
        case .notFound: return StudyPlanRefusal.subjectNotFound.message
        case .other: return "Couldn't save. Nothing was changed."
        }
    }

    public static func keepsDraft(_ error: Error) -> Bool {
        guard case APIError.badStatus(400, _) = error else { return false }

        return true
    }
}
