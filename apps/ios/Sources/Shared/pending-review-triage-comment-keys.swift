import SwiftUI

enum PendingReviewTriageCommentKeys {
    private static let significant: EventModifiers = [.command, .shift, .option, .control]

    static func cardDecision(for input: PendingReviewTriageKeyInput, modifiers: EventModifiers) -> PendingReviewTriageAction? {
        guard modifiers.intersection(significant).isEmpty else { return nil }

        return PendingReviewTriageKeyMap.arrowDecision(for: input)
    }

    static func fieldDecision(for input: PendingReviewTriageKeyInput, modifiers: EventModifiers) -> PendingReviewTriageAction? {
        guard modifiers.intersection(significant) == .command else { return nil }

        return PendingReviewTriageKeyMap.arrowDecision(for: input)
    }

    static func optionMove(for input: PendingReviewTriageKeyInput, modifiers: EventModifiers) -> PendingReviewTriageAction? {
        guard modifiers.intersection(significant).isEmpty else { return nil }

        switch input {
        case .up: return .moveOption(-1)
        case .down: return .moveOption(1)
        default: return nil
        }
    }
}
