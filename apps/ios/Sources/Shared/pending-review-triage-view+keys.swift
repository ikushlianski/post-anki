import SwiftUI

extension PendingReviewTriageView {
    func handle(_ press: KeyPress) -> KeyPress.Result {
        guard !commentFocused, let input = Self.input(from: press) else { return .ignored }

        let command = press.modifiers.contains(.command)

        if let action = Self.arrowAction(for: input, modifiers: press.modifiers, pickOne: model.selection.pickOne) {
            run(action)

            return .handled
        }

        guard let action = PendingReviewTriageKeyMap.action(for: input, command: command, returnAndXOnly: Self.returnAndXOnly)
        else { return .ignored }

        if case .moveOption = action, !model.selection.pickOne { return .ignored }

        if action == .comment {
            #if os(macOS)
            commentFocused = true

            return .handled
            #else
            return .ignored
            #endif
        }

        run(action)

        return .handled
    }

    private static func arrowAction(for input: PendingReviewTriageKeyInput, modifiers: EventModifiers, pickOne: Bool) -> PendingReviewTriageAction? {
        #if os(macOS)
        return pickOne
            ? PendingReviewTriageCommentKeys.optionMove(for: input, modifiers: modifiers)
            : PendingReviewTriageCommentKeys.cardDecision(for: input, modifiers: modifiers)
        #else
        return nil
        #endif
    }

    #if os(macOS)
    var commentField: some View {
        TextField("Comment (optional): N to type, Cmd+Left/Right/Up decides", text: $comment, axis: .vertical)
            .textFieldStyle(.roundedBorder)
            .lineLimit(1...3)
            .focused($commentFocused)
            .accessibilityIdentifier("triage-comment")
            .background(TriageWindowReader(monitor: commentMonitor))
            .onChange(of: comment) {
                if comment.utf16.count > FocusTriageNote.maxUnits { comment = FocusTriageNote.clamped(comment) }
            }
            .onAppear { installCommentMonitor() }
            .onDisappear { commentMonitor.stop() }
            .onChange(of: commentFocused) { commentMonitor.isActive = commentFocused }
    }

    private func installCommentMonitor() {
        commentMonitor.onEscape = {
            commentFocused = false
            isFocused = true
        }
        commentMonitor.onDecision = { action in
            commentFocused = false
            isFocused = true
            run(action)
        }
        commentMonitor.start()
    }
    #endif

    private static var returnAndXOnly: Bool {
        #if os(macOS)
        true
        #else
        false
        #endif
    }

    private static func input(from press: KeyPress) -> PendingReviewTriageKeyInput? {
        switch press.key {
        case .return: return .returnKey
        case .space: return .space
        case .delete, .deleteForward: return .delete
        case .leftArrow: return .left
        case .rightArrow: return .right
        case .upArrow: return .up
        case .downArrow: return .down
        default:
            if press.characters == "\u{3}" { return .returnKey }

            return press.characters.first.map { .character($0) }
        }
    }
}
