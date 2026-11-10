enum PendingReviewTriageAction: Equatable {
    case toggle(Int)
    case keep
    case drop
    case undo
    case skip
    case moveOption(Int)
    case previous
    case next
    case edit
    case chat
    case comment
}

enum PendingReviewTriageKeyInput: Equatable {
    case character(Character)
    case returnKey
    case space
    case delete
    case left
    case right
    case up
    case down
}

enum PendingReviewTriageKeyMap {
    static func action(for input: PendingReviewTriageKeyInput, command: Bool = false, returnAndXOnly: Bool = false) -> PendingReviewTriageAction? {
        if returnAndXOnly {
            switch input {
            case .left, .right, .up, .down, .space, .delete: return nil
            default: break
            }
        }

        switch input {
        case .returnKey, .space: return command ? nil : .keep
        case .delete: return command ? nil : .drop
        case .left: return command ? nil : .moveOption(-1)
        case .right: return command ? nil : .moveOption(1)
        case .up: return command ? nil : .moveOption(-1)
        case .down: return command ? nil : .moveOption(1)
        case .character(let character):
            let lowered = Character(character.lowercased())

            if lowered == "z" { return .undo }

            if command { return nil }

            if let digit = lowered.wholeNumberValue, (1...9).contains(digit) { return .toggle(digit - 1) }

            switch lowered {
            case "x": return .drop
            case "s": return .skip
            case "e": return .edit
            case "c": return .chat
            case "n": return .comment
            default: return nil
            }
        }
    }
}

extension PendingReviewTriageKeyMap {
    static func arrowDecision(for input: PendingReviewTriageKeyInput) -> PendingReviewTriageAction? {
        switch input {
        case .left: return .drop
        case .right: return .keep
        case .up: return .chat
        default: return nil
        }
    }
}
