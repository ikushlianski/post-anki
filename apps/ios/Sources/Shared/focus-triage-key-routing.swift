enum FocusTriageKeyIntent: Equatable {
    case choose(Int)
    case approve
    case reject
    case undo
    case edit
    case move(Int)
}

enum FocusTriageKeyRouting {
    static let leftArrowInput = "UIKeyInputLeftArrow"
    static let rightArrowInput = "UIKeyInputRightArrow"
    static let commandInputs: [String] = (1...9).map(String.init) + ["\r", "x", "z", "e", leftArrowInput, rightArrowInput]

    static func intent(forKeyboardInput input: String) -> FocusTriageKeyIntent? {
        guard let keyInput = PendingReviewTriageKeyInput(keyboardInput: input),
              let action = PendingReviewTriageKeyMap.action(for: keyInput)
        else { return nil }

        return intent(for: action)
    }

    static func intent(for action: PendingReviewTriageAction) -> FocusTriageKeyIntent? {
        switch action {
        case .toggle(let index): return .choose(index)
        case .keep: return .approve
        case .drop: return .reject
        case .undo: return .undo
        case .edit: return .edit
        case .moveOption(let offset): return .move(offset)
        case .skip, .previous, .next, .chat, .comment: return nil
        }
    }
}

extension PendingReviewTriageKeyInput {
    init?(keyboardInput: String) {
        switch keyboardInput {
        case "\r", "\n", "\u{3}": self = .returnKey
        case FocusTriageKeyRouting.leftArrowInput: self = .left
        case FocusTriageKeyRouting.rightArrowInput: self = .right
        case " ": self = .space
        case "\u{8}", "\u{7F}": self = .delete
        default:
            guard keyboardInput.count == 1, let character = keyboardInput.first else { return nil }

            self = .character(character)
        }
    }
}
