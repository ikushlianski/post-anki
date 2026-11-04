import PostAnkiAPI

enum FocusTriageActionLabel {
    static let approve = "Approve"
    static let reject = "Reject"
    static let inbox = "Inbox"
    static let chat = "Chat"
    static let chatIdentifier = "triage.chat"

    static func symbol(for decision: PendingReviewDecision) -> String {
        decision == .approve ? "checkmark.circle.fill" : "xmark.circle.fill"
    }

    static func symbol(for action: FocusTriageVerticalAction) -> String {
        action == .inbox ? "tray.and.arrow.down.fill" : "bubble.left.and.bubble.right.fill"
    }

    static func name(for action: FocusTriageVerticalAction) -> String {
        action == .inbox ? inbox : chat
    }
}
