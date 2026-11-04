import Foundation

public enum CardKind {
    public static let blank = "____"
    public static let blankDisplay = "[...]"

    public static func isBlank(_ kind: String) -> Bool {
        kind == "fill_in_the_blank" || kind == "cloze" || kind == "list_next"
    }

    public static func isOrderedList(_ kind: String) -> Bool {
        kind == "list_step" || kind == "list_next" || kind == "list_overview"
    }

    public static func label(_ kind: String) -> String {
        switch kind {
        case "wh_question": return "Question"
        case "fill_in_the_blank": return "Fill in the blank"
        case "basic": return "Basic card"
        case "cloze": return "Cloze"
        case "list_step": return "List step"
        case "list_next": return "Next step"
        case "list_overview": return "List overview"
        default: return kind
        }
    }

    public static func displayPrompt(kind: String, prompt: String) -> String {
        isBlank(kind) ? hideBlanks(prompt) : prompt
    }

    public static func fillClozeNote(_ note: String) -> String {
        note.replacingOccurrences(
            of: #"\{\{c\d+::(.*?)(?:::[^}]*)?\}\}"#,
            with: "$1",
            options: .regularExpression
        )
    }

    public static func hideBlanks(_ text: String) -> String {
        text.replacingOccurrences(of: blank, with: blankDisplay)
    }
}
