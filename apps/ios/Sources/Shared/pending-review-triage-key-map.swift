enum PendingReviewTriageAction: Equatable {
    case toggle(Int)
    case keep
    case drop
    case undo
    case skip
    case previous
    case next
    case edit
}

enum PendingReviewTriageKeyInput: Equatable {
    case character(Character)
    case returnKey
    case space
    case delete
    case left
    case right
}

enum PendingReviewTriageKeyMap {
    static func action(for input: PendingReviewTriageKeyInput, command: Bool = false) -> PendingReviewTriageAction? {
        switch input {
        case .returnKey, .space: return command ? nil : .keep
        case .delete: return command ? nil : .drop
        case .left: return command ? nil : .previous
        case .right: return command ? nil : .next
        case .character(let character):
            let lowered = Character(character.lowercased())

            if lowered == "z" { return .undo }

            if command { return nil }

            if let digit = lowered.wholeNumberValue, (1...9).contains(digit) { return .toggle(digit - 1) }

            switch lowered {
            case "x": return .drop
            case "s": return .skip
            case "e": return .edit
            default: return nil
            }
        }
    }
}
