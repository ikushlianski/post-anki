import Foundation

public enum ChatQueueFailure: Sendable, Equatable, Error {
    case capReached
    case budgetPaused
    case inFlight
    case notInChat
    case notFound
    case proposalNotPending
    case wrongShape
    case noMessages
    case modelFailed
    case offline
    case unauthorized
    case other

    public static func failure(for error: Error) -> ChatQueueFailure {
        if let failure = error as? ChatQueueFailure { return failure }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost, .cannotFindHost, .dataNotAllowed:
                return .offline
            default:
                return .other
            }
        }

        guard let apiError = error as? APIError else { return .other }

        switch apiError {
        case .unauthorized: return .unauthorized
        case .badStatus(_, "cap_reached"): return .capReached
        case .badStatus(_, "budget_paused"): return .budgetPaused
        case .badStatus(_, "in_flight"): return .inFlight
        case .badStatus(_, "not_in_chat"): return .notInChat
        case .badStatus(_, "proposal_not_pending"): return .proposalNotPending
        case .badStatus(_, "wrong_shape"): return .wrongShape
        case .badStatus(_, "model_failed"): return .modelFailed
        case .badStatus(404, "no_messages"): return .noMessages
        case .badStatus(404, _): return .notFound
        case .badStatus(429, _): return .capReached
        case .badStatus(423, _): return .budgetPaused
        case .badStatus(502, _): return .modelFailed
        default: return .other
        }
    }

    public var message: String {
        switch self {
        case .capReached: return "You have used all the questions for this card. Accept it, reject it, or go back."
        case .budgetPaused: return "AI is paused for now to protect the budget. Try again later."
        case .inFlight: return "The AI is still answering your last message. Wait a moment."
        case .notInChat: return "This card is no longer waiting in Chat."
        case .notFound: return "This card no longer exists."
        case .proposalNotPending: return "This suggestion was already decided."
        case .wrongShape: return "This kind of card cannot be changed here. Edit it on the web."
        case .noMessages: return "There is nothing to delete."
        case .modelFailed: return "The AI could not answer. Try again, no question was used."
        case .offline: return "You are offline. Nothing was changed, try again when you are online."
        case .unauthorized: return "Your access token was rejected. Check Settings."
        case .other: return "Something went wrong. Try again."
        }
    }

    public var deleteLastMessage: String {
        switch self {
        case .inFlight: return "Reply in progress"
        case .other: return "Could not delete the last exchange. Try again."
        default: return message
        }
    }

    public var canRetry: Bool {
        switch self {
        case .offline, .modelFailed, .inFlight, .other: return true
        default: return false
        }
    }
}
