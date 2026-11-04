public enum TriageAnnouncement: Equatable, Sendable {
    case restored
    case sentToChat
    case snoozed(days: Int)
    case movedToInbox
    case movedAllToInbox(count: Int)

    public var message: String {
        switch self {
        case .restored: "Card restored"
        case .sentToChat: "Sent to Chat"
        case .snoozed(let days): "Snoozed for \(ChatQueueSnoozeOptions.label(days: days))"
        case .movedToInbox: "Moved to Inbox"
        case .movedAllToInbox(let count): "\(count) \(count == 1 ? "card" : "cards") moved to Inbox"
        }
    }
}

public enum TriageSwipeDecision: Equatable, Sendable {
    case accept
    case reject
    case chat
    case inbox
}

public enum TriageHapticKind: Equatable, Sendable {
    case success
    case warning
    case lightImpact
    case rigidImpact

    public static func kind(for decision: TriageSwipeDecision) -> TriageHapticKind {
        switch decision {
        case .accept: .success
        case .reject: .warning
        case .chat: .lightImpact
        case .inbox: .rigidImpact
        }
    }
}
