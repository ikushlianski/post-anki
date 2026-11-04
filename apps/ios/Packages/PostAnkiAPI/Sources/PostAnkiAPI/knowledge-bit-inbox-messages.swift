import Foundation

public enum TriageAccessibilityID {
    public static let inboxButton = "triage.inbox"
    public static let exampleButton = "triage.example"
    public static let undoButton = "triage.undo"
    public static let inboxLink = "triage.inbox-link"
    public static let inboxList = "inbox.list"
    public static let inboxChat = "inbox.chat"
    public static let inboxReturn = "inbox.return"
    public static let inboxDiscard = "inbox.discard"
    public static let inboxEdit = "inbox.edit"
    public static let inboxNewExample = "inbox.new-example"

    public static func inboxRow(_ id: String) -> String { "inbox.row.\(id)" }
}

public enum TriageActionName {
    public static let inbox = "Chat about this"
    public static let example = "AI example"
    public static let newExample = "New AI example"
}

public enum InboxMoveOutcome: Sendable, Equatable {
    case removedElsewhere
    case kept(message: String)

    public static func outcome(for error: Error) -> InboxMoveOutcome {
        if let apiError = error as? APIError, case .badStatus(let status, let code) = apiError {
            if (status == 409 && code == "blocked") || (status == 404 && code == "not_found") {
                return .removedElsewhere
            }
        }

        return .kept(message: InboxMessages.message(for: error, doing: "send this to the Inbox"))
    }
}

public enum KnowledgeBitExampleOutcome: Sendable, Equatable {
    case needsOverwriteConfirmation
    case message(String)
    case cancelled

    public static func outcome(for error: Error) -> KnowledgeBitExampleOutcome {
        if InboxMessages.isCancellation(error) { return .cancelled }

        if let apiError = error as? APIError, case .badStatus(_, let code) = apiError {
            switch code {
            case "example_exists":
                return .needsOverwriteConfirmation
            case "limit_reached":
                return .message("You used all \(KnowledgeBitExampleLimits.maxGenerations) AI examples for this item.")
            case "budget_exceeded":
                return .message("AI is paused for today because the daily budget is used up. Try again tomorrow.")
            case "generation_failed":
                return .message("Couldn't write an example. Try again.")
            case "blocked", "not_found":
                return .message("This item changed elsewhere, so it can't get an example now.")
            default:
                break
            }
        }

        return .message(InboxMessages.message(for: error, doing: "write an example"))
    }
}

public enum InboxMessages {
    public static let offline = "This needs an internet connection. Nothing was changed, try again when you are online."

    public static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

    public static func message(for error: Error, doing action: String) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost, .dataNotAllowed:
                return offline
            default:
                break
            }
        }

        if case APIError.unauthorized = error { return "Your access token was rejected. Check Settings." }

        return "Couldn't \(action). Try again."
    }

    public static func listFailure(for error: Error) -> String {
        ConnectionFailureMessage.message(for: error, fallback: "Couldn't load the Inbox.")
    }
}
